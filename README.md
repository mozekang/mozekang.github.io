# 聚会结束后反馈收集页面

一个可部署到 GitHub Pages 的静态反馈入口，后端使用腾讯云 CloudBase 云函数接收提交。页面只让用户完成「选择昵称 + 三道选择题 + 一道开放题」，提交时会附带访问时间、每题停留时间、首次互动时间和总填写时长。

## 文件结构

- `index.html`：静态页面入口
- `config.js`：本场聚会配置，集中修改活动名、电影名、身份昵称、提交接口
- `assets/css/styles.css`：暗色电影感界面与动效
- `assets/js/app.js`：状态管理、题目逻辑、行为时间记录、提交重试
- `cloudfunctions/submitFeedback`：CloudBase HTTP 云函数示例

## 前端配置

修改 `config.js`：

```js
window.FEEDBACK_CONFIG = {
  eventId: "movie-night-001",
  eventName: "周五微醺电影局",
  movieName: "电影名",
  submitEndpoint: "https://your-env-id.service.tcloudbase.com/submitFeedback",
  identities: ["身份 1", "身份 2", "身份 3", "身份 4", "身份 5", "身份 6"],
  includeAnonymous: true
};
```

前端没有任何密钥。刷新前的填写进度只保存在 `sessionStorage`，用于本次会话恢复。

## CloudBase 云函数

在 `cloudfunctions/submitFeedback` 安装依赖后部署为 HTTP 云函数。

建议环境变量：

- `TCB_ENV_ID`：CloudBase 环境 ID
- `ALLOWED_ORIGIN`：GitHub Pages 页面源，例如 `https://yourname.github.io`
- `FEEDBACK_COLLECTION`：原始反馈集合名，默认 `party_feedback_raw`
- `FEEDBACK_AI_COLLECTION`：AI 分析集合名，默认 `party_feedback_ai`
- `DEEPSEEK_API_KEY`：可选。存在时才调用 DeepSeek
- `DEEPSEEK_MODEL`：可选，默认 `deepseek-chat`

原始反馈保存成功是第一优先级。DeepSeek 分析失败只会把 `ai_status` 更新为 `failed`，不会影响前端成功反馈。

## 本地预览

这个页面是纯静态文件，直接打开 `index.html` 即可预览。若浏览器限制本地 `fetch` 或字体加载，可以用任意静态服务器预览。
