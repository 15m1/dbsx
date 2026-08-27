# 拾光手账 · 每日时光手账

单机本地运行的每日时间规划工具（Day Planner）：收集箱 + 时间轴 + 专注计时。
数据只保存在你自己的浏览器里（localStorage），不上传任何云端、不与其他软件捆绑。

## 功能

- **单日时间轴**：6:00–24:00，点击空白处创建任务，卡片可拖动调整时段、拖底部手柄调整时长
- **收集箱**：想到的事先记下来，拖到时间轴即可排程
- **专注计时器**：25 / 45 / 60 分钟番茄钟，结束后可一键标记完成
- **今日回顾**：完成打勾、进度统计、未办事项一键顺延到明天
- **日期切换**：前后日期浏览，一键回到今天
- **深浅色主题**：奶白纸手账风 / 深夜暖棕纸，一键切换
- **数据自主**：导出 / 导入 JSON 备份，随时迁移设备

## 技术栈

- React 19 + TypeScript + Vite
- Zustand（含 persist 中间件，自动持久化到 localStorage）
- 本地打包的中文手写字体（Ma Shan Zheng / ZCOOL KuaiLe），不依赖外部 CDN

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build     # 产物输出到 dist/
npm run preview   # 本地预览构建产物
```

## 部署到 GitHub Pages

项目已配置相对路径 `base: './'`，可部署到任意子路径。

### 方式一：命令行推送（推荐，最简单）

1. 在 GitHub 新建仓库（如 `day-planner`），把代码推上去：

```bash
git init
git add .
git commit -m "init: 拾光手账 Day Planner"
git branch -M main
git remote add origin https://github.com/<你的用户名>/day-planner.git
git push -u origin main
```

2. 本地构建并发布到 `gh-pages` 分支：

```bash
npm run deploy
```

3. 打开仓库 **Settings → Pages**，把 Source 选为 `Deploy from a branch`、分支选 `gh-pages`，保存。
   片刻后即可访问：`https://<你的用户名>.github.io/day-planner/`

### 方式二：GitHub Actions 自动构建部署

在仓库根目录添加 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

然后在 **Settings → Pages** 把 Source 选为 `GitHub Actions`。以后每次 push 到 main 都会自动部署。

## 数据说明

- 所有数据存储在浏览器 `localStorage`（key: `day-planner-storage`），关闭浏览器仍在，清除站点数据会丢失。
- 换设备 / 清理浏览器前，请先在右上角「数据管理」中**导出备份**，换好后**导入备份**恢复。
- 纯静态托管，无后端、无账号，隐私完全由你自己掌控。
