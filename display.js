const fs = require('fs');
const path = require('path');
const opn = require('opn');

function readConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error reading config file:', error);
        return { stocks: [] };
    }
}

function calculateSizeChanges(stock) {
    const fileName = 'data/'+stock+'_data.json';
    try {
        if (!fs.existsSync(fileName)) {
            console.log('No data file found');
            return null;
        }

        const fileContent = fs.readFileSync(fileName, 'utf8');
        const data = JSON.parse(fileContent);

        if (!Array.isArray(data) || data.length < 2) {            
            return null;
        }

        const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
               
        const oneDayChange = {
            date: sortedData[0].date,
            change: parseFloat(sortedData[0].size) - parseFloat(sortedData[1].size)
        };

        let threeDayChange = null;
        if (data.length >= 4) {
            threeDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[3].size)
            };
        }

        let FiveDayChange = null;
        if (data.length >= 6) {
            FiveDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[5].size)
            };
        }

        let TenDayChange = null;
        if (data.length >= 11) {
            TenDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[10].size)
            };
        }

        let ThirtyDayChange = null;
        if (data.length >= 31) {
            ThirtyDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[30].size)
            };
        }

        return {
            oneDayChange,
            threeDayChange,
            FiveDayChange,
            TenDayChange,
            ThirtyDayChange
        };
    } catch (error) {
        console.error('Error calculating size changes:', error);
        return null;
    }
}

function formatNumber(num) {
    if (num === 'N/A') return num;
    return (parseFloat(num)/10000).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getChangeClass(change) {
    if (change === 'N/A') return '';
    return change > 0 ? 'negative' : 'positive';
}

function generateHTML() {
    const config = readConfig();
    const results = [];

    for (const stock of config.stocks) {
        const fileName = 'data/'+stock+'_data.json';
        let name = 'N/A';
        let latestSize = 'N/A';
        try {
            if (fs.existsSync(fileName)) {
                const fileContent = fs.readFileSync(fileName, 'utf8');
                const data = JSON.parse(fileContent);
                if (data && data.length > 0) {
                    name = data[0].name;
                    latestSize = data[0].size;
                }
            }
        } catch (error) {
            console.error(`Error reading data for stock ${stock}:`, error);
        }

        const changes = calculateSizeChanges(stock);
        results.push({
            stock,
            name,
            latestSize: latestSize === 'N/A' ? 'N/A' : parseFloat(latestSize),
            oneDayChange: changes?.oneDayChange?.change ?? 'N/A',
            threeDayChange: changes?.threeDayChange?.change ?? 'N/A',
            fiveDayChange: changes?.FiveDayChange?.change ?? 'N/A',
            tenDayChange: changes?.TenDayChange?.change ?? 'N/A',
            thirtyDayChange: changes?.ThirtyDayChange?.change ?? 'N/A'
        });
    }

    let html = '';
    results.forEach(result => {
        html += `
            <tr>
                <td>${result.stock}</td>
                <td>${result.name}</td>
                <td>${formatNumber(result.latestSize)}</td>
                <td class="${getChangeClass(result.oneDayChange)}">${formatNumber(result.oneDayChange)}</td>
                <td class="${getChangeClass(result.threeDayChange)}">${formatNumber(result.threeDayChange)}</td>
                <td class="${getChangeClass(result.fiveDayChange)}">${formatNumber(result.fiveDayChange)}</td>
                <td class="${getChangeClass(result.tenDayChange)}">${formatNumber(result.tenDayChange)}</td>
                <td class="${getChangeClass(result.thirtyDayChange)}">${formatNumber(result.thirtyDayChange)}</td>
            </tr>
        `;
    });

    const updateTime = new Date().toLocaleString();
    
    return {
        tableHtml: html,
        updateTime: updateTime
    };
}

// Write the HTML content to a file
function writeHTML() {
    const { tableHtml, updateTime } = generateHTML();
    
    // Read the template HTML
    const templatePath = path.join(__dirname, 'index.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace the placeholder with actual data
    htmlContent = htmlContent.replace('<!-- Data will be inserted here by JavaScript -->', tableHtml);
    htmlContent = htmlContent.replace('<span id="updateTime"></span>', updateTime);
    
    // Write the updated HTML to a new file
    const outputPath = path.join(__dirname, 'output.html');
    fs.writeFileSync(outputPath, htmlContent);
    
    console.log('HTML file has been generated successfully!');
    
    // Open the file in the default browser
    opn(outputPath);
}

// Export the functions
module.exports = { writeHTML, calculateSizeChanges }; 