const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');

async function testETFPEAndDP() {
    const fetcher = new ETFPEDPFetcher();
    
    // 测试单个ETF
    console.log('=== 测试单个ETF ===');
    const etfCode = '512890';
    const result = await fetcher.getETFPEAndDP(etfCode);
    
    if (result.success) {
        console.log('✅ 获取成功!');
        console.log(`ETF代码: ${result.etfCode}`);
        console.log(`基金名称: ${result.fundName}`);
        console.log(`指数代码: ${result.indexCode}`);
        console.log(`指数名称: ${result.indexName}`);
        console.log(`市盈率(PE): ${result.peValue}`);
        console.log(`股息率(DP): ${result.dpValue}`);
        console.log(`PE列名: ${result.peColumnName}`);
        console.log(`DP列名: ${result.dpColumnName}`);
    } else {
        console.log('❌ 获取失败!');
        console.log(`错误信息: ${result.error}`);
    }
    
    console.log('\n=== 测试批量获取 ===');
    const etfCodes = ['512890', '515000', '588000'];
    const batchResults = await fetcher.getMultipleETFPEAndDP(etfCodes);
    
    batchResults.forEach((result, index) => {
        console.log(`\n${index + 1}. ETF: ${result.etfCode}`);
        if (result.success) {
            console.log(`   ✅ 成功 - PE: ${result.peValue}, DP: ${result.dpValue}`);
        } else {
            console.log(`   ❌ 失败 - ${result.error}`);
        }
    });
}

// 运行测试
testETFPEAndDP().catch(console.error); 