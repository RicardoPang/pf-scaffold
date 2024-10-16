# pf-scaffold 前端统一研发脚手架

## Getting Started

### 安装：

```bash
npm install -g @pf-scaffold/core
```

### 创建项目

项目/组件初始化

```bash
pf-scaffold init
```

强制清空当前文件夹

```bash
pf-scaffold init --force
```

### 发布项目

发布项目/组件

```bash
pf-scaffold publish
```

强制更新所有缓存

```bash
pf-scaffold publish --force
```

正式发布

```bash
pf-scaffold publish --prod
```

手动指定 build 命令

```bash
pf-scaffold publish --buildCmd "npm run build:test"
```

## More

DEBUG 模式：

```bash
pf-scaffold --debug
```

调试本地包：

```bash
pf-scaffold init --packagePath /Users/pangjianfeng/Desktop/pf-scaffold/packages/init/
```

服务端 pf-scaffold-server：

```bash
git clone https://github.com/RicardoPang/pf-scaffold-server.git
```

脚手架模板 pf-scaffold-template：

```bash
git clone https://github.com/RicardoPang/pf-scaffold-template.git
```
