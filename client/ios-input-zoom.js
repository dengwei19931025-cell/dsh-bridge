// dsh-bridge iOS 输入框聚焦自动放大修复 —— **无条件注入**（与 theme-tokens.js 同级的独立层）
//
// 现象：iPhone / iPad 上点任意输入框，页面被强行放大，且**失焦后不会自动还原**，
// 用户得自己捏回去。iOS 上所有浏览器（Safari / Chrome / 微信内置…）内核都是 WebKit，
// 因此全部命中。
//
// 根因（WebKit 的 zoom-to-focus）：
//   iOS Safari 自 iOS 10 起有一条硬规则 —— 聚焦到可编辑控件时，若该控件的计算
//   font-size < 16px，就把整个页面放大到该阈值。它与 viewport 的 maximum-scale /
//   user-scalable=no **无关**（iOS 10+ 直接忽略这两个值，focus zoom 是另一套独立机制），
//   也与屏幕宽度无关（横屏 iPhone 844px、iPad 768px+ 一样放大）。
//   → 唯一可靠且不损可访问性的解法：让可编辑控件自己就是 16px。
//
// 实际触发面（两类都要覆盖，缺一类就还能复现）：
//   1. 插件自有控件：设置页 s.input 基样式 13px（client/index.js:187）、工作区弹窗内联
//      11~13px、门禁登录页 15px；
//   2. **宿主的对话输入框**：DSH 0.2.0 的 composer 是 Lexical 的 contenteditable div
//      （不是 textarea，见 @deepseek-ai/dsh-client-ui-conversation 的 contenteditable host），
//      插件从未设置其字号，继承宿主约 15px —— 点聊天框就放大，是使用频率最高的一处。
//
// 为什么必须独立成层、且无条件注入（与 theme-tokens.js 完全相同的理由）：
//   - 不能放进 mobile-styles.js：那整块包在 @media (max-width: 767px) 里，横屏 iPhone
//     与 iPad 全部落在断点外面；且 injectMobileStyles() 在 __TAURI__ / __DSH_DESKTOP__ /
//     第三方响应式插件存在时直接 return（见 client/mobile-yield.js），修丁会被一起让掉。
//   - 这是 iOS 平台缺陷的修复，不属于"移动端布局接管"，因此刻意不挂 pageTweaks 开关。
//
// 为什么用 @supports (-webkit-touch-callout: none) 而不是 JS 判 UA：
//   - 纯 CSS、零 JS、零闪烁；-webkit-touch-callout 是 iOS 系独有的特性，桌面 Safari /
//     Chrome / Firefox / Android WebView 均不匹配 → 非 iOS 完全 no-op。
//   - 刻意**不叠** @media (pointer: coarse)：iPad 接上鼠标/触控板后 pointer 会变成 fine，
//     叠上去反而会把修丁让掉，而 focus zoom 依旧存在。
//
// 为什么不采用"聚焦时临时改 16px、失焦还原"的 JS 方案：
//   WebKit 在 focus 决策那一刻读取计算样式，JS 常常来不及，且字号跳变有可见闪烁。
//   固定 16px 是确定性的。
export const IOS_INPUT_ZOOM_CSS = `
  @supports (-webkit-touch-callout: none) {
    /* 会触发 zoom-to-focus 的可编辑控件：文本类 input / textarea / select /
       contenteditable（宿主 composer 属最后一种，DSH 用 Lexical 实现）。

       !important 是必须的：插件自身大量使用内联 fontSize: 11~13
       （client/index.js 的 s.input 与工作区弹窗），非 !important 压不过内联声明。

       刻意排除 checkbox / radio / range / color / file / button / submit / reset /
       image：这些不触发放大，强改 16px 反而会把复选框、滑块、取色器撑坏。 */
    textarea,
    select,
    [contenteditable="true"],
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]) {
      font-size: 16px !important;
    }
  }
`;
