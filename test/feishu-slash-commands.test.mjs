// 飞书 Slash Command（斜杠指令）同步逻辑测试
//
// 依据官方文档：docs/dev/lark-sdk/official-slash-command.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESIRED_SLASH_COMMANDS,
  SLASH_COMMAND_API_PATH,
  buildSlashCommandPayload,
  normalizeManagedIds,
  slashCommandMatches,
  syncSlashCommands,
} from '../lib/feishu/slash-commands.js'

/** 模拟 node-sdk Client：httpInstance 行为与官方默认实例一致（成功→业务体，400→抛错带 response.data） */
function makeFakeClient({ items = [], failWith = null, alreadyExists = new Set() } = {}) {
  const calls = []
  const state = { items: items.map((item) => ({ ...item })) }
  const client = {
    domain: 'https://open.feishu.cn',
    httpInstance: {
      async request({ url, method, data }) {
        calls.push({ url, method, data })
        if (failWith) {
          const err = new Error(failWith.msg)
          err.response = { data: failWith }
          throw err
        }
        if (method === 'GET') return { code: 0, data: { items: state.items } }
        if (method === 'POST') {
          if (alreadyExists.has(data.command)) return { code: 40000000, msg: 'command already exists' }
          const created = {
            command_id: `cmd_${data.command}`,
            command: data.command,
            description: data.description,
            icon: data.description.icon,
          }
          state.items.push(created)
          return { code: 0, data: { command_id: created.command_id } }
        }
        const id = url.split('/').pop()
        if (method === 'PATCH') {
          const item = state.items.find((entry) => entry.command_id === id)
          if (item) {
            item.description = data.description
            item.icon = data.description.icon
          }
          return { code: 0, data: {} }
        }
        if (method === 'DELETE') {
          const existed = state.items.some((entry) => entry.command_id === id)
          state.items = state.items.filter((entry) => entry.command_id !== id)
          return existed ? { code: 0, data: {} } : { code: 40000000, msg: 'command_id not found' }
        }
        throw new Error(`unexpected ${method}`)
      },
    },
  }
  return { client, calls, state }
}

const getToken = async () => 'tenant-token'

test('[斜杠指令] 请求体符合官方文档（command 不带斜杠、icon 放在 description 内）', () => {
  const payload = buildSlashCommandPayload(DESIRED_SLASH_COMMANDS[0])
  assert.equal(payload.command, 'help')
  assert.ok(!payload.command.startsWith('/'), 'command 字段不得带前导斜杠')
  assert.equal(payload.description.default_value, DESIRED_SLASH_COMMANDS[0].zh)
  assert.equal(payload.description.i18n.zh_cn, DESIRED_SLASH_COMMANDS[0].zh)
  assert.ok(payload.description.i18n.en_us)
  assert.equal(payload.description.icon.icon_key, DESIRED_SLASH_COMMANDS[0].icon)
})

test('[斜杠指令] 列表响应（icon 在顶层）与期望一致时判定为已存在', () => {
  const spec = DESIRED_SLASH_COMMANDS[0]
  const item = {
    command_id: 'cmd_1',
    command: spec.command,
    description: { default_value: spec.zh, i18n: { zh_cn: spec.zh, en_us: spec.en } },
    icon: { icon_key: spec.icon },
  }
  assert.equal(slashCommandMatches(item, spec), true)
  assert.equal(slashCommandMatches({ ...item, icon: { icon_key: 'other' } }, spec), false)
  assert.equal(slashCommandMatches({ ...item, description: { ...item.description, default_value: '变了' } }, spec), false)
})

test('[斜杠指令] 首次同步：全部创建并记录 command_id', async () => {
  const { client, calls } = makeFakeClient()
  const result = await syncSlashCommands({ client, getToken })

  assert.equal(result.ok, true)
  assert.equal(result.created.length, DESIRED_SLASH_COMMANDS.length)
  assert.equal(result.updated.length, 0)
  assert.deepEqual(Object.keys(result.ids).sort(), DESIRED_SLASH_COMMANDS.map((c) => c.command).sort())
  assert.ok(Object.values(result.ids).every((entry) => entry.id && entry.ours === true), '本插件创建的指令记为 ours:true')
  assert.equal(calls.filter((c) => c.method === 'POST').length, DESIRED_SLASH_COMMANDS.length)
  assert.ok(calls.every((c) => c.url.startsWith(`https://open.feishu.cn${SLASH_COMMAND_API_PATH}`)))
})

test('[斜杠指令] 二次同步：完全一致时不产生任何写请求', async () => {
  const { client, calls, state } = makeFakeClient()
  const first = await syncSlashCommands({ client, getToken })
  calls.length = 0

  const second = await syncSlashCommands({ client, getToken, managedIds: first.ids })

  assert.equal(second.ok, true)
  assert.equal(second.adopted.length, DESIRED_SLASH_COMMANDS.length)
  assert.deepEqual(calls.map((c) => c.method), ['GET'], '只应查询一次，不写')
  assert.equal(state.items.length, DESIRED_SLASH_COMMANDS.length)
})

test('[斜杠指令] 描述/图标变更：走 PATCH 更新', async () => {
  const stale = DESIRED_SLASH_COMMANDS.map((spec) => ({
    command_id: `cmd_${spec.command}`,
    command: spec.command,
    description: { default_value: '旧文案', i18n: { zh_cn: '旧文案', en_us: 'old' } },
    icon: { icon_key: 'skill_outlined' },
  }))
  const { client, calls } = makeFakeClient({ items: stale })
  const managedIds = Object.fromEntries(stale.map((item) => [item.command, item.command_id]))

  const result = await syncSlashCommands({ client, getToken, managedIds })

  assert.equal(result.ok, true)
  assert.equal(result.updated.length, DESIRED_SLASH_COMMANDS.length)
  assert.equal(result.created.length, 0)
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, DESIRED_SLASH_COMMANDS.length)
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0)
})

test('[斜杠指令] 服务端报「已存在」：重新查询并认领 command_id（不报错）', async () => {
  const spec = DESIRED_SLASH_COMMANDS[0]
  const { client } = makeFakeClient({
    items: [{ command_id: 'cmd_existing', command: spec.command, description: { default_value: spec.zh, i18n: { zh_cn: spec.zh, en_us: spec.en } }, icon: { icon_key: spec.icon } }],
    alreadyExists: new Set([spec.command]),
  })

  const result = await syncSlashCommands({ client, getToken })

  assert.equal(result.ok, true)
  assert.deepEqual(result.ids[spec.command], { id: 'cmd_existing', ours: false }, '认领的同名指令不得标记为自己创建')
  assert.ok(result.adopted.includes(spec.command))
})

test('[斜杠指令] 清理：只删除本插件创建（ours:true）且已下线的指令', async () => {
  const { client, calls } = makeFakeClient()
  const first = await syncSlashCommands({ client, getToken })
  calls.length = 0

  // 模拟：插件升级后 `end` 下线；另有一条同名冲突被"认领"的他人指令（ours:false）
  const managedIds = { ...first.ids, legacy: { id: 'cmd_legacy', ours: true }, borrowed: { id: 'cmd_borrowed', ours: false } }
  const desired = DESIRED_SLASH_COMMANDS.filter((spec) => spec.command !== 'end')
  const result = await syncSlashCommands({ client, getToken, managedIds, desired })

  const deletes = calls.filter((c) => c.method === 'DELETE')
  assert.equal(result.ok, true)
  assert.deepEqual(deletes.map((c) => c.url.split('/').pop()).sort(), ['cmd_end', 'cmd_legacy'], '只删自己创建的')
  assert.ok(!('end' in result.ids) && !('legacy' in result.ids))
  assert.deepEqual(result.ids.borrowed, { id: 'cmd_borrowed', ours: false }, '认领的指令保留记录但不删除')
  assert.ok(result.deleted.includes('end') && result.deleted.includes('legacy'))
})

test('[斜杠指令] 兼容字符串形式的旧记录：保守处理为「非自己创建」，只读不删', () => {
  assert.deepEqual(normalizeManagedIds({ help: 'cmd_1', other: { id: 'cmd_2', ours: true } }), {
    help: { id: 'cmd_1', ours: false },
    other: { id: 'cmd_2', ours: true },
  })
})

test('[斜杠指令] 缺权限（99991640）：返回错误码且保留已完成进度，不抛异常', async () => {
  const { client } = makeFakeClient({ failWith: { code: 99991640, msg: 'lacks permission' } })

  const result = await syncSlashCommands({ client, getToken })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 99991640)
  assert.match(result.error.message, /lacks permission/)
})

test('[斜杠指令] 取 token 失败：返回错误而不抛异常', async () => {
  const { client } = makeFakeClient()
  const result = await syncSlashCommands({
    client,
    getToken: async () => { throw new Error('获取 tenant_access_token 失败：invalid app') },
  })

  assert.equal(result.ok, false)
  assert.match(result.error.message, /tenant_access_token/)
})
