# Requirement

## 总纲

这是一个NodeJS项目。在浏览器中打开copilot登陆（和Visual Studio Code的copilot的插件一样 ）。登陆完后，能保存token，创建一些API去调用Copilot的API，可以通过输入文件（不是必须）和聊天，获取Copilot的返回结果，然后可以使用这些结果。

## 服务端

> server.mjs

server.mjs负责启动服务，还有创建后台API。
主要是储存copilot返回的token还有调用copilot的api然后返回结果。

## 客户端
> index.html

主要的页面。聊天界面，可以输入文件和聊天内容，调用后后台的copilot的api，并输出结果。可以输出文字，也可以输出文件，比如csv。
输入的内容也可以是网址，读取网址后按照输入的要求进行处理。

> index.js

前端的主要的js文件。