# ETF PE/DP 数据获取工具

这个工具可以根据ETF代码自动获取对应的市盈率(PE)和股息率(DP)数据。

## 功能特点

1. **自动获取指数信息**: 根据ETF代码从中证指数官网获取对应的指数代码和名称
2. **自动解析Excel数据**: 从指数官网下载Excel文件并自动提取PE和DP数据
3. **支持批量处理**: 可以同时处理多个ETF代码
4. **错误处理**: 完善的错误处理机制，提供详细的错误信息

## 安装依赖

```bash
npm install
```

## 使用方法

### 1. 单个ETF获取

```javascript
const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');

const fetcher = new ETFPEDPFetcher();
const result = await fetcher.getETFPEAndDP('512890');

if (result.success) {
    console.log(`ETF代码: ${result.etfCode}`);
    console.log(`基金名称: ${result.fundName}`);
    console.log(`指数代码: ${result.indexCode}`);
    console.log(`指数名称: ${result.indexName}`);
    console.log(`市盈率(PE): ${result.peValue}`);
    console.log(`股息率(DP): ${result.dpValue}`);
} else {
    console.error('获取失败:', result.error);
}
```

### 2. 批量获取

```javascript
const etfCodes = ['512890', '515000', '588000'];
const results = await fetcher.getMultipleETFPEAndDP(etfCodes);

results.forEach(result => {
    if (result.success) {
        console.log(`${result.etfCode}: PE=${result.peValue}, DP=${result.dpValue}`);
    } else {
        console.log(`${result.etfCode}: 失败 - ${result.error}`);
    }
});
```

### 3. 运行测试

```bash
node test-etf-pe-dp.js
```

## 返回数据格式

### 成功时返回:

```javascript
{
    success: true,
    etfCode: "512890",
    fundName: "华泰柏瑞中证红利低波动交易型开放式指数证券投资基金",
    indexCode: "H30269",
    indexName: "红利低波",
    peValue: 12.34,        // 市盈率数值
    dpValue: 3.45,         // 股息率数值
    peColumnName: "市盈率1（总股本）P/E1",
    dpColumnName: "股息率1（总股本）D/P1"
}
```

### 失败时返回:

```javascript
{
    success: false,
    error: "错误信息",
    etfCode: "512890"
}
```

## 工作流程

1. **第一步**: 向中证指数官网发送POST请求，根据ETF代码获取对应的指数信息
   - 请求URL: `https://www.csindex.com.cn/csindex-home/index-list/funds-tracking-index`
   - 返回指数代码和指数名称

2. **第二步**: 根据指数代码构建Excel文件URL并下载
   - URL格式: `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/{indexCode}indicator.xls`
   - 解析Excel文件，提取第一行数据中的PE和DP值

## 注意事项

1. **网络连接**: 需要稳定的网络连接访问中证指数官网
2. **请求频率**: 批量处理时会自动添加1秒延迟，避免请求过于频繁
3. **数据格式**: Excel文件格式可能会变化，如果列名发生变化需要相应调整代码
4. **错误处理**: 如果某个ETF获取失败，不会影响其他ETF的处理

## 依赖项

- `node-fetch`: 用于HTTP请求
- `xlsx`: 用于解析Excel文件

## 示例输出

```
开始获取ETF 512890 的PE和DP数据...
找到指数信息: 红利低波 (H30269)
正在获取Excel文件: https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/H30269indicator.xls

=== 获取结果 ===
ETF代码: 512890
基金名称: 华泰柏瑞中证红利低波动交易型开放式指数证券投资基金
指数代码: H30269
指数名称: 红利低波
市盈率(PE): 12.34
股息率(DP): 3.45 