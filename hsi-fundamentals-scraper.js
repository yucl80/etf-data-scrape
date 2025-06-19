const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');


class HSIFundamentalsScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.loginUrl = 'https://www.hsi.com.hk/eng/index360/login';
        this.fundamentalsUrl = 'https://www.hsi.com.hk/index360/schi/indexes?id=01067.00';
        this.outputDir = './hsi-fundamentals-data';
        this.ensureOutputDirectory();
    }

    ensureOutputDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    async initialize() {
        try {
            this.browser = await puppeteer.launch({
                // headless: true, // 设置为false以便观察登录过程
                defaultViewport: { width: 1280, height: 800 },
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            this.page = await this.browser.newPage();
            
            // 设置用户代理
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // 设置额外请求头
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            });

            // 设置请求拦截器来监控网络请求
            await this.page.setRequestInterception(true);
            this.page.on('request', (request) => {
                console.log(`🌐 请求: ${request.method()} ${request.url()}`);
                request.continue();
            });

            this.page.on('response', (response) => {
                console.log(`📡 响应: ${response.status()} ${response.url()}`);
            });

            console.log('✅ 浏览器初始化成功');
            return true;
        } catch (error) {
            console.error('❌ 浏览器初始化失败:', error);
            return false;
        }
    }

    async login(username, password) {
        try {
            console.log('🔐 正在访问HSI登录页面...');
            await this.page.goto(this.loginUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            // 等待页面加载
            await this.page.waitForTimeout(5000);

            // 保存登录页面截图
            await this.page.screenshot({ 
                path: path.join(this.outputDir, 'login-page.png'),
                fullPage: true 
            });

            // 查找登录表单元素
            const loginElements = await this.findLoginElements();
            
            if (!loginElements.username || !loginElements.password) {
                console.log('⚠️ 未找到登录元素，保存调试信息...');
                await this.takeScreenshot('login-debug');
                await this.savePageContent('login-debug');
                return false;
            }

            // 填写登录信息
            await this.fillCredentials(loginElements.username, loginElements.password, username, password);

            // 提交登录表单
            const loginSuccess = await this.submitLoginForm(loginElements.submit);

            if (loginSuccess) {
                console.log('✅ 登录成功！');
                await this.takeScreenshot('login-success');
                return true;
            } else {
                console.log('❌ 登录失败');
                await this.takeScreenshot('login-failed');
                return false;
            }

        } catch (error) {
            console.error('❌ 登录过程中发生错误:', error);
            
            // 特别处理超时错误
            if (error.name === 'TimeoutError') {
                console.log('⏰ 页面加载超时，但可能已经成功加载。尝试继续执行...');
                // 检查页面是否已经加载
                try {
                    const currentUrl = this.page.url();
                    console.log('📍 当前页面URL:', currentUrl);
                    
                    // 如果页面已经加载，尝试继续执行
                    if (currentUrl && !currentUrl.includes('error')) {
                        console.log('🔄 页面似乎已加载，尝试继续登录流程...');
                        await this.takeScreenshot('login-timeout-continue');
                        return await this.continueLoginAfterTimeout(username, password);
                    }
                } catch (e) {
                    console.log('❌ 无法获取当前页面状态:', e.message);
                }
            }
            
            await this.takeScreenshot('login-error');
            return false;
        }
    }

    async findLoginElements() {
        const elements = {
            username: null,
            password: null,
            submit: null
        };

        // 用户名字段选择器 - 更全面的选择器
        const usernameSelectors = [
            'input[type="text"]',
            'input[name="username"]',
            'input[id="username"]',
            'input[name="user"]',
            'input[id="user"]',
            'input[name="email"]',
            'input[id="email"]',
            'input[placeholder*="username" i]',
            'input[placeholder*="user" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="用户名" i]',
            'input[placeholder*="登录" i]'
        ];

        // 密码字段选择器
        const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id="password"]',
            'input[name="pass"]',
            'input[id="pass"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="pass" i]',
            'input[placeholder*="密码" i]'
        ];

        // 提交按钮选择器
        const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Login")',
            'button:contains("Sign In")',
            'button:contains("Log In")',
            'button:contains("登录")',
            'button:contains("登入")',
            'input[value*="Login" i]',
            'input[value*="Sign" i]',
            'input[value*="Submit" i]',
            'input[value*="登录" i]',
            'input[value*="登入" i]'
        ];

        // 查找用户名字段
        for (const selector of usernameSelectors) {
            try {
                elements.username = await this.page.$(selector);
                if (elements.username) {
                    console.log(`✅ 找到用户名字段: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // 查找密码字段
        for (const selector of passwordSelectors) {
            try {
                elements.password = await this.page.$(selector);
                if (elements.password) {
                    console.log(`✅ 找到密码字段: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // 查找提交按钮
        for (const selector of submitSelectors) {
            try {
                elements.submit = await this.page.$(selector);
                if (elements.submit) {
                    console.log(`✅ 找到提交按钮: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // 如果没找到提交按钮，尝试找任何按钮
        if (!elements.submit) {
            const buttons = await this.page.$$('button, input[type="submit"]');
            if (buttons.length > 0) {
                elements.submit = buttons[0];
                console.log('✅ 使用第一个可用按钮作为提交按钮');
            }
        }

        return elements;
    }

    async fillCredentials(usernameField, passwordField, username, password) {
        try {
            // 清除并填写用户名
            await usernameField.click();
            await usernameField.evaluate(el => el.value = '');
            await usernameField.type(username, { delay: 100 });

            // 清除并填写密码
            await passwordField.click();
            await passwordField.evaluate(el => el.value = '');
            await passwordField.type(password, { delay: 100 });

            console.log('✅ 登录信息已填写');
        } catch (error) {
            console.error('❌ 填写登录信息时出错:', error);
            throw error;
        }
    }

    async submitLoginForm(submitButton) {
        if (!submitButton) {
            console.log('❌ 未找到提交按钮');
            return false;
        }

        try {
            // 并发等待页面跳转和点击
            const [response] = await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
                submitButton.click()
            ]);
            console.log('📤 登录表单已提交并页面跳转');

            // 检查跳转后URL
            const currentUrl = this.page.url();
            console.log('📍 登录后当前URL:', currentUrl);
            return !currentUrl.includes('login');
        } catch (error) {
            console.error('❌ 提交登录表单时出错:', error);
            return false;
        }
    }

    async navigateToFundamentals() {
        try {
            console.log('📊 正在访问基本面数据页面...');
            await this.page.goto(this.fundamentalsUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            // 等待页面加载 - 智能等待机制
            let waitTime = 0;
            const maxWaitTime = 15000; // 最大等待15秒
            const checkInterval = 1000; // 每秒检查一次
            
            while (waitTime < maxWaitTime) {
                await this.page.waitForTimeout(checkInterval);
                waitTime += checkInterval;
                
                // 检查页面是否包含基本面相关内容
                const pageContent = await this.page.content();
                if (pageContent.includes('fundamentals') || 
                    pageContent.includes('指数分析') || 
                    pageContent.includes('基本面') ||
                    pageContent.includes('Fundamentals')) {
                    console.log(`✅ 页面内容已加载，等待时间: ${waitTime}ms`);
                    break;
                }
                
                console.log(`⏳ 等待基本面页面加载中... ${waitTime}ms`);
            }

            // 保存页面截图
            await this.takeScreenshot('fundamentals-page');

            // 保存页面内容
            await this.savePageContent('fundamentals-page');

            console.log('✅ 成功访问基本面数据页面');
            return true;

        } catch (error) {
            console.error('❌ 访问基本面数据页面失败:', error);
            
            // 特别处理超时错误
            if (error.name === 'TimeoutError') {
                console.log('⏰ 基本面数据页面加载超时，但可能已经成功加载。尝试继续执行...');
                try {
                    const currentUrl = this.page.url();
                    console.log('📍 当前页面URL:', currentUrl);
                    
                    if (currentUrl && currentUrl.includes('fundamentals')) {
                        console.log('🔄 基本面数据页面似乎已加载，继续执行...');
                        await this.takeScreenshot('fundamentals-timeout-continue');
                        return true;
                    }
                } catch (e) {
                    console.log('❌ 无法获取当前页面状态:', e.message);
                }
            }
            
            await this.takeScreenshot('fundamentals-error');
            return false;
        }
    }

    async extractFundamentalsData() {
        try {
            console.log('🔍 正在提取基本面数据...');

            // 等待页面完全加载
            await this.page.waitForTimeout(5000);

            // 优先从页面div提取
            const pageFundamentals = await this.extractFundamentalsFromPage();
            if (pageFundamentals && pageFundamentals.foundData.length > 0) {
                const timestamp = new Date().toISOString().split('T')[0];
                const dataFileName = path.join(this.outputDir, `fundamentals-data-${timestamp}.json`);
                fs.writeFileSync(dataFileName, JSON.stringify({
                    timestamp,
                    url: this.page.url(),
                    title: await this.page.title(),
                    fundamentals: pageFundamentals
                }, null, 2));
                console.log('✅ 基本面数据提取完成:');
                pageFundamentals.foundData.forEach(d => {
                    console.log(`- ${d.type}: ${d.value}`);
                });
                console.log(`- 数据已保存到: ${dataFileName}`);
                return pageFundamentals;
            } else {
                console.log('❌ 页面未能提取到基本面数据');
                await this.savePageContent('fundamentals-debug');
                return null;
            }
        } catch (error) {
            console.error('❌ 提取基本面数据时发生错误:', error);
            await this.takeScreenshot('fundamentals-extract-error');
            return null;
        }
    }

    async extractFundamentalsFromPage() {
        try {
            console.log('🔍 正在从页面提取基本面数据...');
            const result = await this.page.evaluate(() => {
                let dividendYield = null, peRatio = null, pbRatio = null;
                let foundData = [];
                
                // 直接查找特定的CSS类
                const dividendElements = document.querySelectorAll('.styles_dividendYield__AkWop');
                const peElements = document.querySelectorAll('.styles_peRatio__XnHR3');
                
                console.log('找到周息率元素数量:', dividendElements.length);
                console.log('找到市盈率元素数量:', peElements.length);
                
                // 提取周息率 - 查找包含数字的元素
                for (let i = 0; i < dividendElements.length; i++) {
                    const element = dividendElements[i];
                    const text = element.textContent.trim();
                    console.log(`周息率元素 ${i}: "${text}"`);
                    
                    // 跳过标题元素（只包含"周息率"文本）
                    if (text === '周息率' || text === '') continue;
                    
                    // 提取数字
                    const match = text.match(/(\d+\.?\d*)/);
                    if (match) {
                        dividendYield = parseFloat(match[1]);
                        foundData.push({ type: 'dividendYield', value: dividendYield, text: text });
                        console.log(`找到周息率: ${dividendYield}`);
                        break;
                    }
                }
                
                // 提取市盈率 - 查找包含数字的元素
                for (let i = 0; i < peElements.length; i++) {
                    const element = peElements[i];
                    const text = element.textContent.trim();
                    console.log(`市盈率元素 ${i}: "${text}"`);
                    
                    // 跳过标题元素（只包含"市盈率"文本）
                    if (text === '市盈率 (倍)' || text === '市盈率' || text === '') continue;
                    
                    // 提取数字
                    const match = text.match(/(\d+\.?\d*)/);
                    if (match) {
                        peRatio = parseFloat(match[1]);
                        foundData.push({ type: 'peRatio', value: peRatio, text: text });
                        console.log(`找到市盈率: ${peRatio}`);
                        break;
                    }
                }
                
                // 如果没找到，尝试其他方法
                if (!dividendYield || !peRatio) {
                    // 查找包含基本面数据的表格或div
                    const fundamentalsDiv = document.querySelector('#fundamentals, [id*=fundamental], [class*=fundamental]');
                    let text = '';
                    if (fundamentalsDiv) {
                        text = fundamentalsDiv.innerText || fundamentalsDiv.textContent || '';
                    } else {
                        text = document.body.innerText || '';
                    }
                    text = text.replace(/\s+/g, ' ');
                    
                    console.log('页面文本:', text);
                    
                    // 尝试精确匹配关键词
                    let m = text.match(/周息率[^\d]*(\d+\.?\d*)/);
                    if (m && !dividendYield) {
                        dividendYield = parseFloat(m[1]);
                        foundData.push({ type: 'dividendYield', value: dividendYield, text: m[0] });
                    }
                    
                    m = text.match(/市盈率[^\d]*(\d+\.?\d*)/);
                    if (m && !peRatio) {
                        peRatio = parseFloat(m[1]);
                        foundData.push({ type: 'peRatio', value: peRatio, text: m[0] });
                    }
                    
                    // 如果还是没找到，按顺序提取数字
                    if (!dividendYield || !peRatio) {
                        let nums = text.match(/\d+\.?\d*/g);
                        if (nums && nums.length >= 2) {
                            if (!dividendYield) {
                                dividendYield = parseFloat(nums[0]);
                                foundData.push({ type: 'dividendYield', value: dividendYield, text: `auto: ${nums[0]}` });
                            }
                            if (!peRatio) {
                                peRatio = parseFloat(nums[1]);
                                foundData.push({ type: 'peRatio', value: peRatio, text: `auto: ${nums[1]}` });
                            }
                        }
                    }
                }
                
                return { dividendYield, peRatio, pbRatio, foundData };
            });
            
            if (result && result.foundData.length > 0) {
                console.log(`✅ 从页面提取到 ${result.foundData.length} 个基本面指标`);
                result.foundData.forEach(data => {
                    console.log(`  - ${data.type}: ${data.value} (${data.text})`);
                });
                return result;
            } else {
                console.log('⚠️ 未从页面提取到基本面数据');
                return null;
            }
        } catch (error) {
            console.error('❌ 从页面提取基本面数据时发生错误:', error);
            return null;
        }
    }

    async downloadAndParseExcel(href) {
        try {
            console.log('📥 正在下载Excel文件...');
            
            // 检查是否是blob URL
            if (href.startsWith('blob:')) {
                console.log('⚠️ 检测到blob URL，尝试通过点击下载按钮获取文件...');
                return await this.downloadBlobFile();
            }
            
            // 构建完整的URL
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.page.url()).href;
            console.log('📥 下载URL:', fullUrl);

            // 下载文件
            const response = await this.page.goto(fullUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            if (!response.ok()) {
                console.error('❌ 下载失败，状态码:', response.status());
                return null;
            }

            // 获取文件内容
            const buffer = await response.buffer();
            
            // 保存原始文件
            const timestamp = new Date().toISOString().split('T')[0];
            const excelFileName = path.join(this.outputDir, `fundamentals-excel-${timestamp}.xlsx`);
            fs.writeFileSync(excelFileName, buffer);
            console.log(`✅ Excel文件已保存: ${excelFileName}`);

            // 尝试解析Excel文件
            const excelData = await this.parseExcelFile(buffer);
            
            return {
                fileName: excelFileName,
                fileSize: buffer.length,
                parsedData: excelData
            };

        } catch (error) {
            console.error('❌ 下载或解析Excel文件时发生错误:', error);
            return null;
        }
    }

    async downloadBlobFile() {
        try {
            console.log('🔄 尝试通过点击下载按钮获取文件...');
            
            // 查找下载按钮
            const downloadButtons = await this.page.$$('button, a');
            let downloadButton = null;
            
            for (const button of downloadButtons) {
                const text = await button.evaluate(el => el.textContent.toLowerCase());
                const href = await button.evaluate(el => el.href || '');
                
                if (text.includes('下载') || text.includes('download') || 
                    text.includes('导出') || text.includes('export') ||
                    href.includes('download') || href.includes('export')) {
                    downloadButton = button;
                    console.log('✅ 找到下载按钮:', text);
                    break;
                }
            }
            
            if (!downloadButton) {
                console.log('❌ 未找到下载按钮');
                return null;
            }
            
            // 设置下载监听器
            const downloadPath = path.join(this.outputDir, 'downloads');
            if (!fs.existsSync(downloadPath)) {
                fs.mkdirSync(downloadPath, { recursive: true });
            }
            
            // 监听下载事件
            const client = await this.page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath
            });
            
            // 点击下载按钮
            await downloadButton.click();
            console.log('📤 已点击下载按钮');
            
            // 等待下载完成
            await this.page.waitForTimeout(5000);
            
            // 检查下载目录中的文件
            const files = fs.readdirSync(downloadPath);
            if (files.length > 0) {
                const latestFile = files[files.length - 1];
                const filePath = path.join(downloadPath, latestFile);
                const buffer = fs.readFileSync(filePath);
                
                console.log(`✅ 文件下载成功: ${filePath}`);
                
                // 尝试解析文件
                const excelData = await this.parseExcelFile(buffer);
                
                return {
                    fileName: filePath,
                    fileSize: buffer.length,
                    parsedData: excelData
                };
            } else {
                console.log('❌ 未找到下载的文件');
                return null;
            }
            
        } catch (error) {
            console.error('❌ 下载blob文件时发生错误:', error);
            return null;
        }
    }

    async parseExcelFile(buffer) {
        try {
            console.log('📊 正在解析Excel文件...');
            
            // 使用xlsx库解析Excel文件
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            
            const result = {
                fileType: 'Excel',
                fileSize: buffer.length,
                sheets: workbook.SheetNames,
                data: {}
            };

            // 遍历所有工作表
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                result.data[sheetName] = {
                    rows: jsonData.length,
                    columns: jsonData.length > 0 ? jsonData[0].length : 0,
                    content: jsonData.slice(0, 20) // 只保存前20行用于预览
                };

                // 查找包含基本面数据的行
                const fundamentalsData = this.extractFundamentalsFromSheet(jsonData);
                if (fundamentalsData) {
                    result.data[sheetName].fundamentals = fundamentalsData;
                }
            });

            console.log(`✅ Excel文件解析完成，包含 ${workbook.SheetNames.length} 个工作表`);
            return result;

        } catch (error) {
            console.error('❌ 解析Excel文件时发生错误:', error);
            return {
                fileType: 'Unknown',
                fileSize: buffer.length,
                error: error.message
            };
        }
    }

    extractFundamentalsFromSheet(data) {
        const fundamentals = {
            dividendYield: null,
            peRatio: null,          
            foundRows: []
        };

        // 查找包含基本面指标的行
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || !Array.isArray(row)) continue;

            const rowText = row.map(cell => String(cell || '')).join(' ').toLowerCase();
            
            // 查找周息率/股息率
            if (rowText.includes('周息率') || rowText.includes('股息率') || rowText.includes('dividend yield')) {
                const value = this.extractNumericValue(row);
                if (value !== null) {
                    fundamentals.dividendYield = value;
                    fundamentals.foundRows.push({ type: 'dividend', row: i, data: row });
                }
            }
            
            // 查找市盈率
            if (rowText.includes('市盈率') || rowText.includes('p/e') || rowText.includes('pe ratio')) {
                const value = this.extractNumericValue(row);
                if (value !== null) {
                    fundamentals.peRatio = value;
                    fundamentals.foundRows.push({ type: 'pe', row: i, data: row });
                }
            }
            
            
        }

        return fundamentals.foundRows.length > 0 ? fundamentals : null;
    }

    extractNumericValue(row) {
        for (const cell of row) {
            if (cell === null || cell === undefined) continue;
            
            const cellStr = String(cell).trim();
            
            // 匹配百分比
            const percentMatch = cellStr.match(/(\d+\.?\d*)\s*%/);
            if (percentMatch) {
                return parseFloat(percentMatch[1]);
            }
            
            // 匹配倍数
            const timesMatch = cellStr.match(/(\d+\.?\d*)\s*倍/);
            if (timesMatch) {
                return parseFloat(timesMatch[1]);
            }
            
            // 匹配纯数字
            const numberMatch = cellStr.match(/^(\d+\.?\d*)$/);
            if (numberMatch) {
                return parseFloat(numberMatch[1]);
            }
            
            // 匹配带单位的数字（如万亿、亿等）
            const unitMatch = cellStr.match(/^(\d+\.?\d*)\s*(万亿|亿|万|千亿|千)/);
            if (unitMatch) {
                const value = parseFloat(unitMatch[1]);
                const unit = unitMatch[2];
                switch (unit) {
                    case '万亿': return value * 1000000000000;
                    case '千亿': return value * 100000000000;
                    case '亿': return value * 100000000;
                    case '万': return value * 10000;
                    case '千': return value * 1000;
                    default: return value;
                }
            }
        }
        return null;
    }

    async takeScreenshot(name) {
        try {
            const screenshotPath = path.join(this.outputDir, `${name}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 截图已保存: ${screenshotPath}`);
        } catch (error) {
            console.error('❌ 截图保存失败:', error);
        }
    }

    async savePageContent(name) {
        try {
            const content = await this.page.content();
            const htmlPath = path.join(this.outputDir, `${name}.html`);
            fs.writeFileSync(htmlPath, content);
            console.log(`📄 页面内容已保存: ${htmlPath}`);
        } catch (error) {
            console.error('❌ 页面内容保存失败:', error);
        }
    }

    async smartWait(condition, maxWaitTime = 10000, checkInterval = 1000, description = '等待') {
        let waitTime = 0;
        
        while (waitTime < maxWaitTime) {
            await this.page.waitForTimeout(checkInterval);
            waitTime += checkInterval;
            
            try {
                if (await condition()) {
                    console.log(`✅ ${description}完成，等待时间: ${waitTime}ms`);
                    return true;
                }
            } catch (error) {
                console.log(`⚠️ ${description}检查中出错: ${error.message}`);
            }
            
            console.log(`⏳ ${description}中... ${waitTime}ms`);
        }
        
        console.log(`⏰ ${description}超时，最大等待时间: ${maxWaitTime}ms`);
        return false;
    }

    async continueLoginAfterTimeout(username, password) {
        try {
            console.log('🔄 尝试在超时后继续登录流程...');
            
            // 等待页面稳定 - 增加等待时间
            await this.page.waitForTimeout(5000);
            
            // 保存当前页面截图
            await this.takeScreenshot('login-timeout-page');
            
            // 查找登录表单元素
            const loginElements = await this.findLoginElements();
            
            if (!loginElements.username || !loginElements.password) {
                console.log('❌ 超时后仍未找到登录元素');
                await this.savePageContent('login-timeout-debug');
                return false;
            }

            // 填写登录信息
            await this.fillCredentials(loginElements.username, loginElements.password, username, password);

            // 提交登录表单
            const loginSuccess = await this.submitLoginForm(loginElements.submit);

            if (loginSuccess) {
                console.log('✅ 超时后登录成功！');
                await this.takeScreenshot('login-timeout-success');
                return true;
            } else {
                console.log('❌ 超时后登录失败');
                await this.takeScreenshot('login-timeout-failed');
                return false;
            }

        } catch (error) {
            console.error('❌ 超时后继续登录时发生错误:', error);
            await this.takeScreenshot('login-timeout-error');
            return false;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 浏览器已关闭');
        }
    }
}

// 主函数
async function main() {
    const scraper = new HSIFundamentalsScraper();
    
    try {
        // 初始化
        const initialized = await scraper.initialize();
        if (!initialized) {
            console.error('❌ 初始化失败');
            return;
        }

        // 从配置文件读取登录凭据
        let username, password;
        try {
            const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            username = config.hsi.credentials.username;
            password = config.hsi.credentials.password;
            console.log('✅ 从配置文件读取登录凭据');
        } catch (configError) {
            console.error('❌ 读取配置文件失败:', configError.message);
            username = process.argv[2] || process.env.HSI_USERNAME;
            password = process.argv[3] || process.env.HSI_PASSWORD;
        }

        if (!username || !password) {
            console.error('❌ 请提供用户名和密码');
            console.log('用法: node hsi-fundamentals-scraper.js <username> <password>');
            console.log('或设置环境变量 HSI_USERNAME 和 HSI_PASSWORD');
            console.log('或在 config.json 文件中配置凭据');
            return;
        }

        console.log(`🔐 使用用户名: ${username}`);

        // 登录
        const loginSuccess = await scraper.login(username, password);
        
        if (loginSuccess) {
            console.log('✅ 登录成功！正在访问基本面数据页面...');
            
            // 访问基本面数据页面
            const navigationSuccess = await scraper.navigateToFundamentals();
            
            if (navigationSuccess) {
                // 提取基本面数据
                const data = await scraper.extractFundamentalsData();
                
                if (data) {
                    console.log('\n=== 📊 基本面数据提取结果 ===');
                    console.log(`⏰ 提取时间: ${data.timestamp}`);
                    console.log(`📄 页面标题: ${data.title}`);
                    console.log(`🔍 fundamentals div: ${data.foundData.length > 0 ? '✅ 找到' : '❌ 未找到'}`);
                    
                    if (data.foundData.length > 0) {
                        console.log(`✅ 提取到 ${data.foundData.length} 个基本面指标`);
                        data.foundData.forEach(d => {
                            console.log(`- ${d.type}: ${d.value}`);
                        });
                    } else {
                        console.log('⚠️ 注意: 部分数据未找到，请检查页面结构或查看保存的HTML文件进行调试');
                    }
                } else {
                    console.log('❌ 数据提取失败');
                }
            } else {
                console.log('❌ 访问基本面数据页面失败');
            }
        } else {
            console.log('❌ 登录失败，请检查凭据或查看调试截图');
        }

    } catch (error) {
        console.error('❌ 主函数执行错误:', error);
    } finally {
        await scraper.close();
    }
}

module.exports = HSIFundamentalsScraper;

if (require.main === module) {
    main();
} 