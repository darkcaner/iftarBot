require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const { loadImage } = require('canvas');

// Fontları kaydet
const fontPath = path.join(__dirname, 'fonts');
registerFont(path.join(fontPath, 'Montserrat-Bold.ttf'), { family: 'Montserrat Bold', weight: 700, style: 'normal' });
registerFont(path.join(fontPath, 'Montserrat-Regular.ttf'), { family: 'Montserrat Regular', weight: 400, style: 'normal' });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Bot prefix
const PREFIX = process.env.PREFIX;

let notifiedChannels = new Set();
// Kullanıcı tercihlerini saklamak için Map
let userPreferences = new Map();
// Şehirlerin iftar vakitlerini saklamak için Map
let cityIftarTimes = new Map();
// Son kontrol edilen tarih
let lastCheckedDate = null;
// Karaliste verilerini saklamak için array
let blacklistedUsers = [];

// Türkiye şehirleri listesi
const turkishCities = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir",
    "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır",
    "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay",
    "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli",
    "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu",
    "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa",
    "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın",
    "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

// Karaliste verilerini yükleme fonksiyonu
function loadBlacklist() {
    try {
        const filePath = path.join(__dirname, 'blacklist.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const blacklistData = JSON.parse(data);
            blacklistedUsers = blacklistData.users;
            console.log('Karaliste yüklendi.');
        }
    } catch (error) {
        console.error('Karaliste yüklenirken hata oluştu:', error);
    }
}

// Karaliste verilerini kaydetme fonksiyonu
function saveBlacklist() {
    try {
        const filePath = path.join(__dirname, 'blacklist.json');
        fs.writeFileSync(filePath, JSON.stringify({ users: blacklistedUsers }, null, 2));
    } catch (error) {
        console.error('Karaliste kaydedilirken hata oluştu:', error);
    }
}

// Tercihleri dosyadan yükleme fonksiyonu
function loadPreferences() {
    try {
        const filePath = path.join(__dirname, 'userPreferences.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            userPreferences = new Map(Object.entries(jsonData));
            console.log('Kullanıcı tercihleri yüklendi.');
        }
    } catch (error) {
        console.error('Tercihler yüklenirken hata oluştu:', error);
    }
}

// Tercihleri dosyaya kaydetme fonksiyonu
function savePreferences() {
    try {
        const filePath = path.join(__dirname, 'userPreferences.json');
        const jsonData = Object.fromEntries(userPreferences);
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    } catch (error) {
        console.error('Tercihler kaydedilirken hata oluştu:', error);
    }
}

// Türkçe karakterleri İngilizce karakterlere çeviren fonksiyon
function turkishToEnglish(text) {
    const turkishChars = {'ç':'c', 'ğ':'g', 'ı':'i', 'i':'i', 'ö':'o', 'ş':'s', 'ü':'u', 'İ':'I'};
    return text.replace(/[çğıiöşüİ]/g, letter => turkishChars[letter]);
}

// Şehir adını API için düzenleyen fonksiyon
function formatCityForAPI(city) {
    // Özel karakterleri düzelt
    const specialCases = {
        'İstanbul': 'Istanbul',
        'İzmir': 'Izmir',
        'Çanakkale': 'Canakkale',
        'Çorum': 'Corum',
        'Çankırı': 'Cankiri',
        'Şanlıurfa': 'Sanliurfa',
        'Şırnak': 'Sirnak',
        'Ağrı': 'Agri',
        'Iğdır': 'Igdir'
    };

    return specialCases[city] || city;
}

// İftar vaktini çeken fonksiyon
async function getIftarTime(city) {
    try {
        const formattedCity = formatCityForAPI(city);
        const today = new Date();
        const date = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
        
        const response = await axios.get(`https://api.aladhan.com/v1/timingsByCity/${date}?city=${formattedCity}&country=Turkey&method=13`);
        
        // Yarının tarihini hesapla
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = `${tomorrow.getDate()}-${tomorrow.getMonth() + 1}-${tomorrow.getFullYear()}`;
        
        // Yarının vakitlerini al
        const tomorrowResponse = await axios.get(`https://api.aladhan.com/v1/timingsByCity/${tomorrowDate}?city=${formattedCity}&country=Turkey&method=13`);
        
        return {
            maghrib: response.data.data.timings.Maghrib, // Bugünün iftar vakti
            fajr: response.data.data.timings.Fajr, // Bugünün imsak vakti
            tomorrowFajr: tomorrowResponse.data.data.timings.Fajr, // Yarının imsak vakti
            tomorrowMaghrib: tomorrowResponse.data.data.timings.Maghrib // Yarının iftar vakti
        };
    } catch (error) {
        console.error('Namaz vakitleri alınırken hata oluştu:', error);
        return null;
    }
}

// Canvas ile progress bar oluşturan fonksiyon
async function createProgressBar(percentage, hours, minutes, imsakTime, iftarTime, dateStr, cityName, isImsakMode = false) {
    const canvas = createCanvas(800, 180);
    const ctx = canvas.getContext('2d');

    // Arka plan
    ctx.fillStyle = '#2f3136'; // Siyah arka plan
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tüm içeriği dikey olarak ortala
    const totalHeight = 140;
    const startY = (canvas.height - totalHeight) / 2;

    // Üst kısımdaki bilgileri yerleştir
    ctx.font = '20px "Montserrat Bold"';
    ctx.fillStyle = '#ffffff'; // Beyaz yazı
    
    // Tarih ve şehir (en üst satır)
    ctx.textAlign = 'left';
    ctx.fillText(dateStr, 40, startY + 20);
    ctx.textAlign = 'right';
    ctx.fillText(cityName, canvas.width - 40, startY + 20);
    
    // İmsak ve iftar saatleri (ikinci satır)
    ctx.textAlign = 'left';
    ctx.fillText(`İmsak: ${imsakTime}`, 40, startY + 45);
    ctx.textAlign = 'right';
    ctx.fillText(`İftar: ${iftarTime}`, canvas.width - 40, startY + 45);

    // Progress bar arka planı (yuvarlak köşeli)
    const barHeight = 40;
    const barWidth = 720;
    const cornerRadius = barHeight / 2;
    const barX = 40;
    const barY = startY + 65;

    // Progress bar çizimi
    ctx.beginPath();
    ctx.moveTo(barX + cornerRadius, barY);
    ctx.lineTo(barX + barWidth - cornerRadius, barY);
    ctx.arc(barX + barWidth - cornerRadius, barY + cornerRadius, cornerRadius, -Math.PI/2, Math.PI/2);
    ctx.lineTo(barX + cornerRadius, barY + barHeight);
    ctx.arc(barX + cornerRadius, barY + cornerRadius, cornerRadius, Math.PI/2, -Math.PI/2);
    ctx.closePath();
    ctx.fillStyle = '#40444b';
    ctx.fill();

    // Progress bar (yuvarlak köşeli ve gradyan)
    // İmsak modu veya iftar sonrası için full bar
    const progress = isImsakMode ? barWidth - cornerRadius : (percentage / 100) * (barWidth - cornerRadius);
    if (progress > 0) {
        ctx.beginPath();
        ctx.moveTo(barX + cornerRadius, barY);
        ctx.lineTo(barX + progress, barY);
        if (progress > cornerRadius) {
            ctx.arc(barX + progress, barY + cornerRadius, cornerRadius, -Math.PI/2, Math.PI/2);
        }
        ctx.lineTo(barX + cornerRadius, barY + barHeight);
        ctx.arc(barX + cornerRadius, barY + cornerRadius, cornerRadius, Math.PI/2, -Math.PI/2);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(barX, 0, barX + progress + cornerRadius, 0);
        if (isImsakMode) {
            gradient.addColorStop(0, '#FF0000');    // Kırmızı
            gradient.addColorStop(0.5, '#FF6B6B');  // Açık kırmızı
            gradient.addColorStop(1, '#FFFFFF');    // Beyaz
        } else {
            gradient.addColorStop(0, '#00CED1');    // Turkuaz
            gradient.addColorStop(0.5, '#4169E1');  // Royal Blue
            gradient.addColorStop(1, '#1E90FF');    // Dodger Blue
        }
        ctx.fillStyle = gradient;
        ctx.fill();

        // Parlama efekti
        const shine = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        shine.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
        ctx.fillStyle = shine;
        ctx.fill();
    }

    // Alt kısımdaki metinleri ekle (progress bar'ın hemen altında)
    ctx.font = '24px "Montserrat Bold"';
    ctx.fillStyle = '#ffffff'; // Beyaz yazı
    
    // Kalan süre (sol alt)
    if (hours !== 0 || minutes !== 0) {
        ctx.textAlign = 'left';
        ctx.fillText(`${hours} saat ${minutes} dakika`, barX + 10, barY + barHeight + 35);
    }
    
    // Yüzde (sağ alt) - İmsak modunda gösterme
    if (!isImsakMode) {
        ctx.textAlign = 'right';
        ctx.fillText(`%${Math.round(percentage)}`, barX + barWidth - 10, barY + barHeight + 35);
    }

    return canvas.toBuffer();
}

// Motivasyon mesajı seçen fonksiyon
function getMotivationalMessage(percentage, isImsakMode = false) {
    if (isImsakMode) {
        return "İftar vakti geçti. İmsağa kalan süre:";
    }
    if (percentage < 25) {
        return "Sabır en büyük erdemdir. Az kaldı! 🌅";
    } else if (percentage < 50) {
        return "Yolun çeyreğinden fazlası bitti! Devam et! 💪";
    } else if (percentage < 75) {
        return "Yarıyı geçtik! İftar yaklaşıyor! 🕌";
    } else if (percentage < 90) {
        return "Son düzlüğe girdik! Az kaldı! 🎉";
    } else {
        return "İftar çok yakında! Sabrınız mübarek olsun! 🌙";
    }
}

// Kalan süreyi hesaplayan fonksiyon
function calculateRemainingTime(times) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Bugünün vakitlerini ayarla
    const [iftarHours, iftarMinutes] = times.maghrib.split(':');
    const [imsakHours, imsakMinutes] = times.fajr.split(':');
    
    // Tam tarih nesneleri oluştur
    const iftar = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(iftarHours), parseInt(iftarMinutes), 0, 0);
    const imsak = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(imsakHours), parseInt(imsakMinutes), 0, 0);
    
    // Yarının vakitlerini ayarla
    const [nextImsakHours, nextImsakMinutes] = times.tomorrowFajr.split(':');
    const [nextIftarHours, nextIftarMinutes] = times.tomorrowMaghrib.split(':');
    
    const nextImsak = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), parseInt(nextImsakHours), parseInt(nextImsakMinutes), 0, 0);
    const nextIftar = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), parseInt(nextIftarHours), parseInt(nextIftarMinutes), 0, 0);

    // İftar vakti geçti mi? (İftar sonrası ve gece yarısından önce VEYA gece yarısından sonra)
    if (now > iftar) {
        const diffToNextImsak = nextImsak - now;
        const hoursToImsak = Math.floor(diffToNextImsak / (1000 * 60 * 60));
        const minutesToImsak = Math.floor((diffToNextImsak % (1000 * 60 * 60)) / (1000 * 60));
        
        // İftar sonrası imsak moduna geç - % 100'ü kullanıyoruz çünkü tam full bar isteniyor
        return {
            isBeforeImsak: false,
            isAfterIftar: true,
            hours: hoursToImsak,
            minutes: minutesToImsak,
            percentage: 100, // İftar sonrası için % 100
            imsakTime: times.fajr,
            iftarTime: times.maghrib,
            nextImsakTime: times.tomorrowFajr,
            nextIftarTime: times.tomorrowMaghrib
        };
    }

    // İmsak ile iftar arası
    if (now >= imsak && now <= iftar) {
        const totalTime = iftar - imsak;
        const passedTime = now - imsak;
        const percentage = Math.min(100, Math.max(0, (passedTime / totalTime) * 100));
        
        const diff = iftar - now;
        const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
            isBeforeImsak: false,
            isAfterIftar: false,
            hours: hoursLeft,
            minutes: minutesLeft,
            percentage,
            imsakTime: times.fajr,
            iftarTime: times.maghrib,
            nextImsakTime: times.tomorrowFajr,
            nextIftarTime: times.tomorrowMaghrib
        };
    }

    // İmsak vaktinden önce
    // Gece yarısından sonraki durum kalanlar için kullan
    const diffToImsak = imsak - now;
    const hoursToImsak = Math.floor(diffToImsak / (1000 * 60 * 60));
    const minutesToImsak = Math.floor((diffToImsak % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        isBeforeImsak: true,
        isAfterIftar: true, // Burası değişti - iftar sonrası modu gibi davranacak
        hours: hoursToImsak,
        minutes: minutesToImsak,
        percentage: 100, // imsak öncesi full bar
        imsakTime: times.fajr,
        iftarTime: times.maghrib,
        nextImsakTime: times.tomorrowFajr,
        nextIftarTime: times.tomorrowMaghrib
    };
}

// İmsakiye oluşturan fonksiyon
async function createImsakiye(city, isDarkTheme = true) {
    const canvas = createCanvas(1000, 1500); // Yüksekliği düşürdüm
    const ctx = canvas.getContext('2d');

    // Tema renkleri
    const theme = {
        background: isDarkTheme ? '#2f3136' : '#ffffff',
        text: isDarkTheme ? '#ffffff' : '#000000',
        header: '#ff9f43',
        border: isDarkTheme ? '#40444b' : '#e0e0e0',
        highlight: '#ff9f43'
    };

    // Arka plan
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Başlık
    ctx.font = '48px "Montserrat Bold"';
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.fillText(`${city.toUpperCase()} 2025`, 50, 80);
    ctx.fillText('RAMAZAN İMSAKİYESİ', 50, 140);

    // Tablo ayarları
    const headers = ['GÜN', 'TARİH', 'İMSAK', 'GÜNEŞ', 'ÖĞLE', 'İKİNDİ', 'AKŞAM', 'YATSI'];
    const columnWidths = [60, 200, 100, 100, 100, 100, 100, 100]; // Tarih sütununu genişlettim
    const startX = 50;
    const startY = 220;
    const rowHeight = 38;
    let currentY = startY;

    // Tablo başlığı
    let currentX = startX;
    ctx.font = '20px "Montserrat Bold"';
    
    // Başlık arka planı
    ctx.fillStyle = theme.border;
    ctx.fillRect(startX, currentY - 25, canvas.width - (startX * 2), rowHeight);
    
    headers.forEach((header, index) => {
        // Dikey çizgiler
        if (index > 0) {
            ctx.beginPath();
            ctx.moveTo(currentX, currentY - 25);
            ctx.lineTo(currentX, currentY + rowHeight - 25);
            ctx.strokeStyle = theme.border;
            ctx.stroke();
        }
        
        ctx.fillStyle = theme.header;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; // Yazıyı dikeyde ortala
        ctx.fillText(header, currentX + columnWidths[index] / 2, currentY - 5); // Dikey konumu ayarla
        currentX += columnWidths[index];
    });
    
    ctx.textBaseline = 'alphabetic'; // Varsayılana döndür
    currentY += rowHeight;

    // Tarih ve vakitleri al
    const startDate = new Date('2025-03-01');
    const rows = [];

    // 30 günlük veriyi topla
    for (let i = 0; i < 30; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const weekDay = currentDate.toLocaleDateString('tr-TR', { weekday: 'long' });
        const formattedDate = `${dateStr} ${weekDay}`;

        try {
            const response = await axios.get(
                `https://api.aladhan.com/v1/timingsByCity/${currentDate.getDate()}-${currentDate.getMonth() + 1}-${currentDate.getFullYear()}?city=${formatCityForAPI(city)}&country=Turkey&method=13`
            );

            const timings = response.data.data.timings;
            rows.push({
                day: (i + 1).toString(),
                date: formattedDate,
                imsak: timings.Fajr,
                gunes: timings.Sunrise,
                ogle: timings.Dhuhr,
                ikindi: timings.Asr,
                aksam: timings.Maghrib,
                yatsi: timings.Isha
            });
        } catch (error) {
            console.error(`${city} için vakitler alınamadı (${dateStr}):`, error);
        }
    }

    // Verileri tabloya yerleştir
    rows.forEach((row, rowIndex) => {
        currentX = startX;
        const values = [row.day, row.date, row.imsak, row.gunes, row.ogle, row.ikindi, row.aksam, row.yatsi];
        
        // Satır arka planı
        ctx.fillStyle = rowIndex % 2 === 0 ? theme.background : (isDarkTheme ? '#383838' : '#f5f5f5');
        ctx.fillRect(startX, currentY - rowHeight + 5, canvas.width - (startX * 2), rowHeight);

        values.forEach((value, columnIndex) => {
            // Dikey çizgiler
            if (columnIndex > 0) {
                ctx.beginPath();
                ctx.moveTo(currentX, currentY - rowHeight + 5);
                ctx.lineTo(currentX, currentY + 5);
                ctx.strokeStyle = theme.border;
                ctx.stroke();
            }

            ctx.font = rowIndex === 26 ? '16px "Montserrat Bold"' : '16px "Montserrat Regular"';
            ctx.fillStyle = (columnIndex === 2 || columnIndex === 6) ? theme.highlight : (rowIndex === 26 ? theme.highlight : theme.text);
            
            // Tarih sütunu için sola hizalama, diğerleri için merkez hizalama
            ctx.textAlign = columnIndex === 1 ? 'left' : 'center';
            ctx.textBaseline = 'middle';
            
            // Tarih sütunu için padding ekle
            const xPosition = columnIndex === 1 ? 
                currentX + 10 : // Tarih sütunu için sol padding
                currentX + columnWidths[columnIndex] / 2; // Diğer sütunlar için merkez
            
            ctx.fillText(value, xPosition, currentY - rowHeight/2 + 5);
            currentX += columnWidths[columnIndex];
        });
        
        ctx.textBaseline = 'alphabetic';

        // Yatay çizgi
        ctx.beginPath();
        ctx.moveTo(startX, currentY + 5);
        ctx.lineTo(canvas.width - startX, currentY + 5);
        ctx.strokeStyle = theme.border;
        ctx.stroke();

// Kadir Gecesi için özel stil
    if (rowIndex === 26) {
        // Kadir Gecesi arka plan
        ctx.fillStyle = isDarkTheme ? '#4a3525' : '#fff3e0';
        ctx.fillRect(startX, currentY - rowHeight + 5, canvas.width - (startX * 2), rowHeight + 20);
    
        // Kadir Gecesi yazısını ekle
        ctx.save(); // Mevcut durumu kaydet
        ctx.fillStyle = theme.highlight;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '20px "Montserrat Bold"';
    
        const text = 'KADİR GECESİ';
        const textWidth = ctx.measureText(text).width;
        const centerX = startX + (canvas.width - (startX * 2)) / 2; // Ortada tut
        const centerY = currentY - rowHeight / 2 + 10; // Dikey ortalamayı düzelt
    
        ctx.fillText(text, centerX, centerY);
    
        ctx.restore(); // Önceki duruma geri dön
        currentY += 20; // Ekstra boşluk ekle
    }

        currentY += rowHeight;
    });

    // Logo ve site adı - Alt marj ile
    try {
        const logoPath = path.join(__dirname, 'images', 'sitwatch.png');
        const logo = await loadImage(logoPath);
        const logoSize = 40;
        const logoX = 60;
        const logoY = canvas.height - logoSize - 20; // Alt kenardan 20px yukarıda
        
        // Logo çiz
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        
        // Site adını yaz
        ctx.font = '24px "Montserrat Bold"';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('sitwatch.net', logoX + logoSize + 20, logoY + logoSize/2);
    } catch (error) {
        console.error('Logo yüklenirken hata oluştu:', error);
    }

    return canvas.toBuffer();
}

// Bot hazır olduğunda
client.once('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    console.log(`Bot Davet Linki: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=274878221312&scope=bot`);
    loadPreferences();
    loadBlacklist(); // Karalisteyi yükle
    client.user.setActivity(`${PREFIX}iftar | ${PREFIX}bolge`, { type: ActivityType.Watching });
});

// Mesaj komutlarını dinle
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase().split(' ');

    // Eğer kullanıcı karalistede ise ve komut kullanıyorsa mesajı sil
    if (blacklistedUsers.includes(message.author.id) && message.content.startsWith(PREFIX)) {
        try {
            await message.delete();
            return;
        } catch (error) {
            console.error('Mesaj silinirken hata oluştu:', error);
        }
        return;
    }

    // Karaliste komutları
    if (command[0] === `${PREFIX}karaliste`) {
        // Yetki kontrolü
        if (message.author.id !== 'BURAYI_DEGISTIRIN') {
            message.reply('Bu komutu kullanma yetkiniz yok!').then(msg => {
                setTimeout(() => msg.delete(), 5000); // 5 saniye sonra mesajı sil
            });
            return;
        }

        // Etiketlenen kullanıcıyı al
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            if (command[1] === 'liste') {
                // Karaliste listesini göster
                const blacklistedUsersList = await Promise.all(blacklistedUsers.map(async userId => {
                    try {
                        const user = await client.users.fetch(userId);
                        return `• ${user.tag} (${userId})`;
                    } catch {
                        return `• Bilinmeyen Kullanıcı (${userId})`;
                    }
                }));

                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('⛔ Karaliste')
                    .setDescription(blacklistedUsersList.length > 0 ? 
                        blacklistedUsersList.join('\n') : 
                        'Karalistede kimse yok.')
                    .setTimestamp();

                message.reply({ embeds: [embed] });
                return;
            }
            message.reply('Lütfen bir kullanıcı etiketleyin!');
            return;
        }

        // Kullanıcı zaten karalistede mi kontrol et
        const userIndex = blacklistedUsers.indexOf(mentionedUser.id);
        if (userIndex > -1) {
            // Kullanıcıyı karalisteden çıkar
            blacklistedUsers.splice(userIndex, 1);
            saveBlacklist();
            message.reply(`${mentionedUser.tag} karalisteden çıkarıldı!`);
        } else {
            // Kullanıcıyı karalisteye ekle
            blacklistedUsers.push(mentionedUser.id);
            saveBlacklist();
            message.reply(`${mentionedUser.tag} karalisteye eklendi!`);
        }
        return;
    }

    // Bot etiketlendiğinde yardım mesajı gönder
    if (message.content === `<@${client.user.id}>`) {
        message.reply(`Merhaba! \`${PREFIX}yardım\` yazarak komutlarımı öğrenebilirsin 🌙`);
        return;
    }

    // Yardım komutları
    if (command[0] === `${PREFIX}yardım` || command[0] === `${PREFIX}yardim` || command[0] === `${PREFIX}help`) {
        const embed = new EmbedBuilder()
            .setColor('#ff9f43')
            .setTitle('📋 İftar Bot Komutları')
            .setDescription('Aşağıdaki komutları kullanarak iftar vakitlerini öğrenebilir ve diğer özellikleri kullanabilirsiniz:')
            .addFields(
                { 
                    name: `${PREFIX}iftar`, 
                    value: `• Varsayılan/kayıtlı şehriniz için iftar bilgilerini gösterir.\n• Örnek: \`${PREFIX}iftar\`\n• Farklı şehir için: \`${PREFIX}iftar Ankara\``, 
                    inline: false 
                },
                { 
                    name: `${PREFIX}bolge`, 
                    value: `• Varsayılan şehrinizi ayarlar.\n• Örnek: \`${PREFIX}bolge İstanbul\`\n• Bot bu şehri hatırlayacak ve ${PREFIX}iftar komutunda kullanacaktır.`,
                    inline: false 
                },
                {
                    name: `${PREFIX}imsakiye`,
                    value: `• Ramazan imsakiyesini gösterir.\n• Örnek: \`${PREFIX}imsakiye\`\n• Farklı şehir için: \`${PREFIX}imsakiye Ankara\`\n• Tema değiştirmek için: \`${PREFIX}imsakiye [şehir] beyaz\` veya \`${PREFIX}imsakiye [şehir] siyah\``,
                    inline: false
                },
                {
                    name: `${PREFIX}ping`,
                    value: '• Botun yanıt süresini gösterir.',
                    inline: false
                },
                {
                    name: `${PREFIX}yardım`,
                    value: `• Bu yardım mesajını gösterir.\n• Alternatif komutlar: \`${PREFIX}yardim\`, \`${PREFIX}help\``,
                    inline: false
                }
            )
            .setFooter({ text: 'Hayırlı Ramazanlar! 🌙' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (command[0] === `${PREFIX}ping`) {
        const sent = await message.reply('Ping ölçülüyor...');
        const timeDiff = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`🏓 Pong!\n> Gecikme: \`${timeDiff}ms\`\n> API Gecikmesi: \`${Math.round(client.ws.ping)}ms\``);
        return;
    }

    if (command[0] === `${PREFIX}bolge`) {
        const city = command.slice(1).join(' ');
        if (!city) {
            return message.reply(`Lütfen bir şehir adı girin. Örnek: ${PREFIX}bolge Ankara`);
        }

        // Şehir adının ilk harfini büyük, geri kalanını küçük yap
        let cityName = city.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        // Şehir listesinde eşleşen şehri bul
        const matchedCity = turkishCities.find(city => 
            turkishToEnglish(city.toLowerCase()) === turkishToEnglish(cityName.toLowerCase())
        );

        if (matchedCity) {
            userPreferences.set(message.author.id, matchedCity);
            savePreferences(); // Tercihleri kaydet
            message.reply(`Bölgeniz ${matchedCity} olarak ayarlandı! \`${PREFIX}iftar\` komutunu kullanmayı deneyin.`);
        } else {
            message.reply('Geçersiz şehir adı! Lütfen Türkiye\'deki bir şehir adı girin. Varsayılan olarak İstanbul kullanılacak.');
        }
        return;
    }

    if (command[0] === `${PREFIX}destroy`) {
        if (message.author.id === 'BURAYI_DEGISTIRIN') {
            await message.reply('Client \'Yok Ediliyor\'...');
            process.exit(0);
        }
        return;
    }

    if (command[0] === `${PREFIX}iftar`) {
        try {
            let cityToUse;
            const cityArgument = command.slice(1).join(' ');

            if (cityArgument) {
                // Şehir argümanı verilmişse, geçerli bir şehir mi kontrol et
                const cityName = cityArgument.toLowerCase().split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ');

                // Şehir listesinde eşleşen şehri bul
                const matchedCity = turkishCities.find(city => 
                    turkishToEnglish(city.toLowerCase()) === turkishToEnglish(cityName.toLowerCase())
                );

                if (matchedCity) {
                    cityToUse = matchedCity;
                } else {
                    return message.reply('Geçersiz şehir adı! Lütfen Türkiye\'deki bir şehir adı girin.');
                }
            } else {
                // Şehir argümanı verilmemişse, kullanıcının kayıtlı şehrini veya varsayılan olarak İstanbul'u kullan
                cityToUse = userPreferences.get(message.author.id) || 'İstanbul';
            }

            const times = await getIftarTime(cityToUse);
            if (times) {
                const remaining = calculateRemainingTime(times);
                
                const motivationalMsg = remaining.isAfterIftar && !remaining.isBeforeImsak ? 
                    `İftar vakti geçti! Sahura kalan:` : 
                    remaining.isBeforeImsak ? 
                    `Yolun çevresinden fazlası bitti! Devam et! 💪` :
                    getMotivationalMessage(remaining.percentage, remaining.isBeforeImsak);

                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);

                const dateStr = today.toLocaleDateString('tr-TR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    weekday: 'long'
                });

                const tomorrowDateStr = tomorrow.toLocaleDateString('tr-TR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    weekday: 'long'
                });

                const embed = new EmbedBuilder()
                    .setColor('#2f3136')
                    .setTitle('🕌 ' + motivationalMsg)
                    .setAuthor({ 
                        name: 'İftar.', 
                        iconURL: 'https://cdn.discordapp.com/attachments/1298345325550895184/1345774538436247552/pide.png?ex=67c5c5b5&is=67c47435&hm=3b75a0aebf1044d1c2d04f32c37b427487a057257b2e9043407aa2a04295907c&' 
                    });

                let progressBuffer;
                if (remaining.isBeforeImsak) {
                    // İmsak vakti öncesi (gece yarısı sonrası)
                    progressBuffer = await createProgressBar(
                        remaining.percentage,
                        remaining.hours,
                        remaining.minutes,
                        times.fajr,
                        times.maghrib,
                        dateStr,
                        cityToUse,
                        true // İmsak modu için kırmızı-beyaz gradyan
                    );
                } else if (remaining.isAfterIftar) {
                    // İftar vakti sonrası - burada da kırmızı gradyan kullanılacak
                    progressBuffer = await createProgressBar(
                        remaining.percentage,
                        remaining.hours,
                        remaining.minutes,
                        times.tomorrowFajr,
                        times.tomorrowMaghrib,
                        tomorrowDateStr,
                        cityToUse,
                        true // İftar sonrası için de kırmızı-beyaz gradyan
                    );
                } else {
                    // İmsak ile iftar arası
                    progressBuffer = await createProgressBar(
                        remaining.percentage,
                        remaining.hours,
                        remaining.minutes,
                        times.fajr,
                        times.maghrib,
                        dateStr,
                        cityToUse,
                        false // Normal mavi gradyan
                    );
                }

                const attachment = new AttachmentBuilder(progressBuffer, { name: 'progress.png' });
                embed.setImage('attachment://progress.png')
                    .setFooter({ text: cityArgument ? 
                        `Hayırlı Ramazanlar! | Şehir yazmaya üşeniyor musunuz? ${PREFIX}bolge ile değiştirebilirsiniz.` : 
                        `Hayırlı Ramazanlar! | Şehir yanlış mı? ${PREFIX}bolge ile değiştirebilirsiniz.`
                    })
                    .setTimestamp();

                message.reply({ 
                    embeds: [embed],
                    files: [attachment]
                });
            }
        } catch (error) {
            console.error(error);
            message.reply('Bir hata oluştu, lütfen daha sonra tekrar deneyin.');
        }
    }

    // İmsakiye komutunu güncelle
    if (command[0] === `${PREFIX}imsakiye`) {
        try {
            let cityToUse;
            const args = command.slice(1);
            const themeArg = args.find(arg => arg === 'beyaz' || arg === 'siyah');
            const cityArgument = args.filter(arg => arg !== 'beyaz' && arg !== 'siyah').join(' ');
            const isDarkTheme = themeArg !== 'beyaz';

            if (cityArgument) {
                const cityName = cityArgument.toLowerCase().split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ');

                const matchedCity = turkishCities.find(city => 
                    turkishToEnglish(city.toLowerCase()) === turkishToEnglish(cityName.toLowerCase())
                );

                if (matchedCity) {
                    cityToUse = matchedCity;
                } else {
                    return message.reply('Geçersiz şehir adı! Lütfen Türkiye\'deki bir şehir adı girin.');
                }
            } else {
                cityToUse = userPreferences.get(message.author.id) || 'İstanbul';
            }

            const loadingMsg = await message.reply('İmsakiye hazırlanıyor, lütfen bekleyin...');
            const imsakiyeBuffer = await createImsakiye(cityToUse, isDarkTheme);
            const attachment = new AttachmentBuilder(imsakiyeBuffer, { name: 'imsakiye.png' });

            const embed = new EmbedBuilder()
                .setColor(isDarkTheme ? '#2f3136' : '#ffffff')
                .setTitle(`📅 ${cityToUse} 2025 Ramazan İmsakiyesi`)
                .setDescription(`Tema değiştirmek için: \`${PREFIX}imsakiye [şehir] beyaz\` veya \`${PREFIX}imsakiye [şehir] siyah\``)
                .setImage('attachment://imsakiye.png')
                .setFooter({ text: 'Hayırlı Ramazanlar! 🌙' })
                .setTimestamp();

            await loadingMsg.delete();
            message.reply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error(error);
            message.reply('Bir hata oluştu, lütfen daha sonra tekrar deneyin.');
        }
    }
});

// Botu başlat
client.login(process.env.DISCORD_TOKEN);
//korna
