const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');

// 示例1: 获取单个ETF的PE和DP数据
async function exampleSingleETF() {
    console.log('=== 示例1: 获取单个ETF数据 ===');
    
    const fetcher = new ETFPEDPFetcher();
    const etfCode = '512890';
    
    try {
        const result = await fetcher.getETFPEAndDP(etfCode);
        
        if (result.success) {
            console.log(`✅ 成功获取 ${etfCode} 的数据:`);
            console.log(`   基金名称: ${result.fundName}`);
            console.log(`   指数代码: ${result.indexCode}`);
            console.log(`   指数名称: ${result.indexName}`);
            console.log(`   市盈率(PE): ${result.peValue}`);
            console.log(`   股息率(DP): ${result.dpValue}`);
        } else {
            console.log(`❌ 获取失败: ${result.error}`);
        }
    } catch (error) {
        console.error('执行出错:', error.message);
    }
}

// 示例2: 批量获取多个ETF的PE和DP数据
async function exampleBatchETF() {
    console.log('\n=== 示例2: 批量获取多个ETF数据 ===');
    
    const fetcher = new ETFPEDPFetcher();
    const etfCodes = ['512890', '515000', '588000'];
    
    try {
        const results = await fetcher.getMultipleETFPEAndDP(etfCodes);
        
        console.log('批量获取结果:');
        results.forEach((result, index) => {
            if (result.success) {
                console.log(`  ${index + 1}. ${result.etfCode}: PE=${result.peValue}, DP=${result.dpValue}`);
            } else {
                console.log(`  ${index + 1}. ${result.etfCode}: 失败 - ${result.error}`);
            }
        });
    } catch (error) {
        console.error('执行出错:', error.message);
    }
}

// 运行所有示例
async function runAllExamples() {
    console.log('ETF PE/DP 获取工具使用示例\n');
    
    await exampleSingleETF();
    await exampleBatchETF();
    
    console.log('\n=== 所有示例执行完成 ===');
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    exampleSingleETF,
    exampleBatchETF
}; 