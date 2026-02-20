# Ubuntu 无 GUI 网页调试指南（Headless）

## 1. 先回答你的问题：没有 GUI 怎么“看”网页
在无图形界面的机器上，常用方式是：
- 用 **无头浏览器**（Playwright/Chromium headless）加载页面。
- 读取 **DOM、CSS 计算结果、元素尺寸、位置、截图** 来判断页面状态。
- 通过自动化测试复现问题并验证修复。

我这次就是这样做的：
- 跑 `npm test` 做回归。
- 用 Playwright 脚本读取 `#map-container` 和地图路径的 `boundingBox`，确认地图显示占比。
- 必要时导出截图到文件再查看。

## 2. 环境准备
```bash
npm install
npx playwright install --with-deps
```

## 3. 本地启动（无头调试）
任选一种：

1. 用项目已有测试配置自动起服务并运行测试
```bash
npm test
```

2. 手动起静态服务
```bash
python3 -m http.server 8090
# 或 npx http-server -p 8080 --silent
```

## 4. 用 Playwright 脚本检查页面
### 4.1 截图
```bash
node - <<'PLAYSHOT'
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-text', { state: 'hidden', timeout: 20000 });
  await page.click('button[data-mode="province-click"]');
  await page.waitForSelector('#map-container svg');
  await page.screenshot({ path: '/tmp/page.png', fullPage: true });
  await browser.close();
})();
PLAYSHOT
```

### 4.2 读取布局尺寸（判断“太小/太偏”最有效）
```bash
node - <<'PLAYBOX'
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-text', { state: 'hidden', timeout: 20000 });
  await page.click('button[data-mode="province-click"]');
  await page.waitForSelector('#map-container svg');

  const container = await page.locator('#map-container').boundingBox();
  const paths = page.locator('#map-container path.map-feature');
  const count = await paths.count();

  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for (let i = 0; i < count; i++) {
    const b = await paths.nth(i).boundingBox();
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  console.log('container:', Math.round(container.width), Math.round(container.height));
  console.log('features:', Math.round(maxX-minX), Math.round(maxY-minY));
  await browser.close();
})();
PLAYBOX
```

## 5. 无 GUI 场景下常用排查点
- 数据是否加载成功：
  - 看 `#loading-text` 是否 hidden。
  - 看模式按钮是否 enabled。
- 地图是否真的渲染：
  - `#map-container svg` 是否存在。
  - `path.map-feature` 数量是否 > 0。
- 布局是否合理：
  - 容器尺寸与地图路径外接框比值。
- 交互是否正常：
  - 用 Playwright 模拟滚轮缩放、拖拽平移、点击答题。

## 6. 无 GUI 调试技巧
- 端口冲突时先清理：
```bash
lsof -i :8080 -sTCP:LISTEN -n -P
kill <PID>
```
- 保留调试产物到 `/tmp`：截图、日志、指标输出，便于对比前后版本。
- 修改后先跑回归测试：
```bash
npm test
```

## 7. 推荐工作流（无 GUI）
1. 写最小复现脚本（进入页面 + 定位问题模式）。
2. 量化问题（尺寸/数量/状态，不只“看起来”）。
3. 改 CSS/投影/渲染逻辑。
4. 同脚本复测 + `npm test`。
5. 提交并推送。
