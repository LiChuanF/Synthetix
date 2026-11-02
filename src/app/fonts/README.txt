这两个 woff2 文件来自项目此前构建出的镜像（/app/.next/static/media/），
是 next/font/google 在构建时下载并做过的 latin 子集、可变字重版本：

  plus-jakarta-sans-latin.woff2   Plus Jakarta Sans, wght 400-700
  inter-latin.woff2               Inter, wght 400-600

来源：Google Fonts（Inter、Plus Jakarta Sans），SIL Open Font License 1.1。
把它们放进仓库后，next build 不再需要访问 fonts.googleapis.com，
内网断网环境也能完成构建。
