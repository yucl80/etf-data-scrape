#!/usr/bin/env node

const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');

// 获取命令行参数
const args = process.argv.slice(2);

function showHelp() {
    console.log(`
ETF PE/DP 数据获取工具

使用方法:
  node etf-pe-dp-cli.js <ETF代码>                    # 获取单个ETF的PE和DP数据
  node etf-pe-dp-cli.js <ETF代码1> <ETF代码2> ...    # 批量获取多个ETF的PE和DP数据
  node etf-pe-dp-cli.js --help                       # 显示帮助信息

示例:
  node etf-pe-dp-cli.js 512890
  node etf-pe-dp-cli.js 512890 515000 588000

参数:
  ETF代码    要查询的ETF代码，支持多个代码用空格分隔
  --help     显示帮助信息
`);
}

async function main() {
    // 检查是否有参数
    if (args.length === 0) {
        console.error('错误: 请提供至少一个ETF代码');
        showHelp();
        process.exit(1);
    }

    // 检查是否请求帮助
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        return;
    }

    const fetcher = new ETFPEDPFetcher();
    
    // 过滤掉非ETF代码的参数
    const etfCodes = args.filter(arg => !arg.startsWith('-'));
    
    if (etfCodes.length === 0) {
        console.error('错误: 请提供有效的ETF代码');
        showHelp();
        process.exit(1);
    }

    console.log(`开始获取 ${etfCodes.length} 个ETF的PE和DP数据...\n`);

    if (etfCodes.length === 1) {
        // 单个ETF
        const etfCode = etfCodes[0];
        const result = await fetcher.getETFPEAndDP(etfCode);
        
        if (result.success) {
            console.log('\n=== 获取结果 ===');
            console.log(`ETF代码: ${result.etfCode}`);
            console.log(`基金名称: ${result.fundName}`);
            console.log(`指数代码: ${result.indexCode}`);
            console.log(`指数名称: ${result.indexName}`);
            console.log(`市盈率(PE): ${result.peValue}`);
            console.log(`股息率(DP): ${result.dpValue}`);
            console.log(`PE列名: ${result.peColumnName}`);
            console.log(`DP列名: ${result.dpColumnName}`);
        } else {
            console.error('\n❌ 获取失败!');
            console.error(`错误信息: ${result.error}`);
            process.exit(1);
        }
    } else {
        // 批量获取
        const results = await fetcher.getMultipleETFPEAndDP(etfCodes);
        
        console.log('\n=== 批量获取结果 ===');
        
        let successCount = 0;
        let failCount = 0;
        
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. ETF: ${result.etfCode}`);
            if (result.success) {
                successCount++;
                console.log(`   ✅ 成功`);
                console.log(`      基金名称: ${result.fundName}`);
                console.log(`      指数代码: ${result.indexCode}`);
                console.log(`      指数名称: ${result.indexName}`);
                console.log(`      市盈率(PE): ${result.peValue}`);
                console.log(`      股息率(DP): ${result.dpValue}`);
            } else {
                failCount++;
                console.log(`   ❌ 失败 - ${result.error}`);
            }
        });
        
        console.log(`\n=== 统计信息 ===`);
        console.log(`总计: ${results.length} 个ETF`);
        console.log(`成功: ${successCount} 个`);
        console.log(`失败: ${failCount} 个`);
        
        if (failCount > 0) {
            process.exit(1);
        }
    }
}

// 运行主函数
main().catch(error => {
    console.error('程序执行出错:', error.message);
    process.exit(1);
}); 