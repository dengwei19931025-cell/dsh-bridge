// 飞书云文档评论（@机器人）相关纯函数
//
// 官方依据：docs/dev/lark-sdk/README.zh.md「云文档评论 — channel.comments」与 0.7.1 类型定义
//   CommentEvent { fileToken, fileType, commentId, replyId?, operator{openId}, mentionedBot, timestamp }
//   FetchedComment { commentId, replies[{ reply_id?, content?.elements[] }], quote?, isWhole }
//   CommentReplyContentElement = text_run | docs_link | person
//
// 评论回复是**纯文本**（没有卡片/流式/按钮），所以这里把结构化评论拍平成文本，交给会话桥当一轮输入。

/** 合成评论会话 peer id（与聊天 peer `oc_…` 明显区分，出站据此改走评论回复） */
export function buildCommentPeerId({ fileToken, commentId } = {}) {
  return `comment:${fileToken ?? ''}:${commentId ?? ''}`
}

export function isCommentPeerId(peerId) {
  return typeof peerId === 'string' && peerId.startsWith('comment:')
}

/** 拍平一条评论回复的富文本元素为纯文本（text_run / docs_link / person） */
export function flattenCommentElements(elements) {
  if (!Array.isArray(elements)) return ''
  return elements
    .map((el) => {
      if (el?.type === 'text_run') return el.text_run?.text ?? ''
      if (el?.type === 'docs_link') return el.docs_link?.url ?? ''
      if (el?.type === 'person') return `@${el.person?.user_id ?? ''}`
      return ''
    })
    .join('')
    .trim()
}

/**
 * 从 FetchedComment 提取"用户这次说了什么"：
 *   - text：最后一条回复的正文（评论线程里最新那条就是本次触发内容）
 *   - quote：行内评论选中的文档原文（有则作为上下文）
 *   - isWhole：整篇文档评论（无行内线程）——回复要直接发顶层评论，避免 SDK 先探一次 in-thread 失败
 *   - replyId：最后一条回复的 id（当前未用，留给后续"评论打字中"表情等）
 */
export function extractCommentInput(fetched) {
  const replies = Array.isArray(fetched?.replies) ? fetched.replies : []
  const last = replies[replies.length - 1]
  return {
    text: flattenCommentElements(last?.content?.elements),
    quote: String(fetched?.quote ?? '').trim(),
    isWhole: Boolean(fetched?.isWhole),
    replyId: last?.reply_id ?? '',
    replyCount: replies.length,
  }
}
