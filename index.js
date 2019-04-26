const cheerio = require('cheerio');
const request = require('request-promise');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Product = require('./models/product');
const bodyParser = require('body-parser');
const _ = require('lodash');
const puppeteer = require('puppeteer');

const app = express();

//Connect mongoDB
mongoose.connect('mongodb://localhost/amz-cheerio')
    .then(() => console.log('Connected to MongoDB...'))
    .catch(() => console.error('Could not connected MongoDB...', err));

//Middleware
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}));
// parse application/json
app.use(bodyParser.json());


//Load View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

//Set Public Folder
app.use(express.static(path.join(__dirname,'public')));

//Home Route
app.get('/', (req, res) => {
    (async() => {
        const products = await getProduct();
        res.render('index', {
            title: 'List of Product',
            products: products,
            total: products.length  
        })
    })()
});

//get Route
app.get('/products/get', (req, res) => {
    res.render('get', {
        title: 'Get Product'
    });
});

//POST Submit Route
app.post('/products/get',(req, res) => {
    let asin = req.body.asin;
    let title = req.body.title;
    let promo = req.body.promo;
    Product.findOne({asin}, (err, product) => {
        if (_.isEmpty(product)) {
            (async() => {
                let details = await getProductDetail(asin);
                let product = new Product();
                product.asin = asin;
                product.title = title;
                product.price = details.price;
                product.seller = details.seller;
                product.status = details.status;
                product.image = details.img;
                product.isPromo = promo == "on" ? true : false;
                try {
                    await product.save();
                    res.render('description',{
                        title: 'Product Description',
                        product: product,
                        about: details.about,
                        description: details.description
                      });
                } catch (ex) {
                    console.log(ex.message)
                }
            })();
        } else {
            res.render('edit_product',{
              product: product
            })
        }
    })
})


//Get Single Product
app.get('/product/:asin', (req, res) => {
    const asin = req.params.asin;
    Product.findOne({asin}, (err, product) => {
        if(_.isEmpty(product)) {
            res.status(404).send('ASIN can not found');
        } else {
            res.render('edit_product',{
                product: product
            })
        } 
    });
  });

//Edit submit post Route
app.post('/product/:asin', (req, res) =>{
    Product.updateOne({asin: req.params.asin}, {
        $set:{
            price: req.body.price,
            status: req.body.status
        }
    },(err) => {
        if(err) {
            console.log(err);
            return;
        } else{
        res.redirect('/');
        }
    });
});

//Delete Product
app.delete('/product/:asin',(req, res) => {
    Product.deleteOne({asin: req.params.asin}, (err) => {
        if(err){
            console.log(err);
        }
        res.send('Success');
    });
});

//Func get Product Detail
async function getProductDetail (asin) {
    const URL = `https://www.amazon.com/dp/${asin}`;
    const res = await request({
        url: URL,
        headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,zh-TW;q=0.6,zh-CN;q=0.5,zh;q=0.4',
            'cache-control': 'max-age=0',
            'cookie': 'ubid-main=132-0890182-3045412; session-id-time=2082787201l; session-id=144-4073134-0536961; x-wl-uid=1sc+T2vBUVT2WskxcBFhfwiC7usHYi5iyF8I8aBT47IvfU7VBS+AaHnY4Tsn7GWUT0kMoWd6vxLqG1iPqaPIUkw==; lc-main=en_US; s_vnum=1986801149381%26vn%3D1; s_nr=1554801199349-New; s_dslv=1554801199352; UserPref=dz/dpOf/IfKXl92egdxW6ztCasLS12Z2RsQrqNAyMJnBAycQ0rYO0f59LIRY/KnP+00SVQRNVa3U0s5VCBTB3UgSzzvt7ojb6dNFa5/ennJ8di6PMTxtML7X1aJPF9u43hOzDZdoRX+UgekJjVKNYZEmUT8pGJMnamd4RTtYlugpnqqYZtnPPOZoZSNw85ZoUops0gfxYHAfXZ+3LZ+g6k0RMP1AI6jbyYQ/6essBfF4kcS/gTAQp5MCjGXdfIRBkFzsoSbKOgSIVmV3dOuBj6uAo+LB1y959P9/VtIrFWB9K/K2NRpfaAGD5rJgVATo8sWOlzzMTLiHMX1bIf3+Jde6dJLzc7UQOTSdKcwv4EndXktn5bn50ECk34AoTpgBG0SOJu9R1S3WWWjRX5q8PFiKs/VObszUIGvRbBWlNxBGpc9PF0RycSe760IzVFiw; x-main="dMBuMpCwKePVm64FuugIQd8a7eDWIEJKoiTPp@9XDzlmy7gCz6@Q0Q5yAlgHf@e9"; at-main=Atza|IwEBIOvbK7DojmxAwBPRYQu9gye-oJRx946Lc2Os5zKMhw8jCVy3FeoYMfokSOcYKzB4v7nFoasMOmaus5JX4EcTaEdsxmBr9Gibz6PGS1iRWwlfj8hoLoaZzS7azhVkkGJnvmN2QJmwQCq31LhBbZ62Cv-2MBaZkrQVj-NS_H9Va--WBy_eq8MOvbWhMMBIKZhasz2D8rVLyJsViFLc2X7jx4iZ30rd86DXs2CHHEOHSUdtL_hu4ndWQ130-9KOKlTvNAWK0JNNE-Dz1We27lIR0SqkQAaW5Wvnj8sgHmDabKf-51R3pCaL4Adaxs01iRTBUFlEgrsLqSQBBSMeTQiojf5yqQZhUN7JBO2r7hoqwEe7-dLFtIl86U7jKxa8XBfI0yY73m5k10zD5Uhxp5ASpxMh; sess-at-main="UuPQtgLFfDAaPX0wJ1p7II+hs4jSBe2jez8gv5iUoRc="; sst-main=Sst1|PQGRJPdz5Sh45auqto9qb9EzC_-2hCR666L50bEGP0HnG7R1bmtZkR-ucZLsyE0JUwZKXD1pG4IDfUEhiq7kTPb1K77uLDzk_3_c8D_PzgaiTYPmR5OPYlhNja0eKIhVxJYmcNQhcxpZ5sAmaqSzsyL-qBrTfkR7yjgakUn-aVyEgc9O5LrRgyHTyRfvKIPMJHYbndzYd6sT6zS3RmyXvbF9Yfw-GU1A5wUcfiQBOWALfdH_Vvxc5OCV5v6l2211jWSxQX8b4R0YFiM0HlV0ewJNYPu4ofxEVsnHQZtPMIqAthXgPIA7fLhtW2cmGNGRUUzb8C77Kf7HlIY5KHCEm-sHJg; i18n-prefs=USD; session-token="24/sqQUuNOk7vrGkLICU1j8NIVK+njOTDVsDmE8LTFTGJ74lwKKdyLFRNKG055wCz13hW1fnbRAVSAITbg7yHQeeTZr5NARzWgWWvLkU5UvtcSEhFyB+/22zWAOrwGvwePvJK+ZcPJplzvkmXsFmn0BSuCWFpsgl7l7wne4Jhc2aT06IM5tHzdkJZ5xHXTdUhk6JdebLU6QNyIplH+k9f2nzfXNQrN+JCSzVxB72B5id6R69uE5+7zV/VzwuElo/E1ejMHd5DeC5bH4VFSIboA=="; csm-hit=tb:CXBPW49NCXZ24FHC4JMC+s-7X8KH90ADDN5E1BXWFZ6|1555040947006&t:1555040947006&adb:adblk_no',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36'
        },
        gzip: true
    }).catch(err => {
        let errMessage = err.options.url + ' ' + err.statusCode + ' Not Found';
        console.log(errMessage);
        return errMessage;
    });
    const $ = cheerio.load(res);
    const img = $('#imgTagWrapperId > img').attr('data-old-hires');
    const status = $('#availability').text().trim();
    let price, seller;
    if (!status.includes('Available from these sellers.') && !status.includes('Currently unavailable.')) {
        price = /[^$]+/g.exec($('#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice').text().trim())[0];
        seller = $('#merchant-info').text().trim();
    };
    const about = [];
    let arr = $('ul[class="a-unordered-list a-vertical a-spacing-none"] > li, ul[class="a-unordered-list a-vertical a-spacing-none collapsedFeatureBullets"] > li');
    let i = 0;
    let len = arr.length;
    for (i; i < len; i++) {
        about.push($(arr[i]).text().trim());
    };

    let description = $('div[id="productDescription"]');
    description = !_.isEmpty(description) ? $(description[0]).html().trim() : "";

    return {
        price,
        status,
        seller,
        img,
        asin,
        about,
        description
    }
};

//Func Get Product
async function getProduct () {
    return await Product.find({}).sort({date:-1});
}

//Func Check price 
async function checkPrice() {
    const products =  await Product
      .find()
      .select({asin: 1, status:1, price: 1});
    let i;
    for (i = 0; i < products.length; i++) {
        console.log('Check ASIN: ',products[i].asin);
        const cproduct = await getProductDetail(products[i].asin);
        if (cproduct.status.includes('In Stock.') || cproduct.status.includes('Only') ){
            if(products[i].price < cproduct.price){
                await sendEmail('SẢN PHẨM TĂNG GIÁ', products[i].price,cproduct.price,products[i].asin);
            } else if(products[i].price > cproduct.price){
                await sendEmail('SẢN PHẨM GIẢM GIÁ', products[i].price,cproduct.price,products[i].asin);
            }
        } else {
            await sendEmail('SẢN PHẨM HẾT HÀNG', products[i].price,cproduct.status,products[i].asin);
        };
    };
    console.log('Update Complete');
};

//Send Email Func
async function sendEmail(subject, price, cprice, asin)
{
    var transporter = nodemailer.createTransport({
        service : 'gmail',
        auth: {
            user : 'd.huyb94@gmail.com',
            pass : 'chinchopa94'
        }
    });
    var mailOptions= {
        from : 'd.huyb94@gmail.com',
        to: 'd.huyb94@gmail.com',
        subject : subject,
        text : `ASIN: ${asin }, Giá cũ: ${price}, Giá mới: ${cprice}
        Link san pham: https://www.amazon.com/dp/${asin }`
    }
    transporter.sendMail(mailOptions, function(err, info){
        if(err)
        {
            console.log('Lỗi khi gửi mail: ', err);
        }
        else
        {
            console.log('Đã gửi email: ', info.response);
        }
    });
};

//Set Time Check Price
var timer = setInterval(async function() {
    return await checkPrice();
}, 3600000);

//Check Promo Code
async function checkPromoCode () {
    //Initial
    var productsPromo = await Product.find({ isPromo: true });
    browser = await puppeteer.launch({
        headless: false,
        defaultViewport: false
    });
    page = await browser.newPage();

    // khong load img, css, fond
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (request.resourceType() === 'image' || request.resourceType() === 'font') {
            request.abort();
        } else {
            request.continue();
        }
    });
    // || request.resourceType() === 'stylesheet' || request.resourceType() === 'font'
    //Set Cookies
    let cookiesArr =  [
    {
        "domain": ".amazon.com",
        "expirationDate": 2186877585.251874,
        "hostOnly": false,
        "httpOnly": true,
        "name": "at-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": "0",
        "value": "Atza|IwEBIBMp0-0e35DWNrKXs5rPB_OGxDekInJlO4-9T-nHIR9zMBJWc70OiTL2jf-RN2YhhkLfAUUh-kMfHmEhna6dyJZx1iwqos1PEBbiO1t_yBQv7LQu3Z5jCMXzKTw-ytgKVbH-j6UYxPX0F3x8edQg-tUue_Q_t6N0qmOFZ8GZKlJ7PxOVLkWA1DjcN-kIJAswZRRfTDvKP9g0Kb1UYthQyVYpHL-ZBQPQ-9h5e-WsqLnxgjdJVOHM9wyFbENwMw8Hvxxavs3T_DT_Qb-MjPmKglc-p1hjaoY287wclTd3i6grgNKYGwOzQdJMZgcfTuOo9481_YZh1z4SBVAiKyZQnBgGE5WVCKG4hJIkxDbiyxx2LKyQoNybPX5RXa4XbHjJbEnlKWC9g9FcGoMShusltk2e",
        "id": 1
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 1649744245.442081,
        "hostOnly": false,
        "httpOnly": false,
        "name": "aws-priv",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "eyJ2IjoxLCJldSI6MCwic3QiOjB9",
        "id": 2
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787201.429128,
        "hostOnly": false,
        "httpOnly": false,
        "name": "i18n-prefs",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "USD",
        "id": 3
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787200.548574,
        "hostOnly": false,
        "httpOnly": false,
        "name": "lc-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "en_US",
        "id": 4
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 1649409199,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_dslv",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "1554801199352",
        "id": 5
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 1986801199,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_nr",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "1554801199349-New",
        "id": 6
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 1986801149,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_vnum",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "1986801149381%26vn%3D1",
        "id": 7
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2186877585.251919,
        "hostOnly": false,
        "httpOnly": true,
        "name": "sess-at-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": "0",
        "value": "\"BFN2dgXXbZmwY2KQMPKE2ZK6iqgj9BqK69BQG9IqJ0g=\"",
        "id": 8
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787201.372154,
        "hostOnly": false,
        "httpOnly": false,
        "name": "session-id",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "139-5561679-6623453",
        "id": 9
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787201.372127,
        "hostOnly": false,
        "httpOnly": false,
        "name": "session-id-time",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "2082787201l",
        "id": 10
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787201.848783,
        "hostOnly": false,
        "httpOnly": false,
        "name": "session-token",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "\"o7R4fvtBYb8fEbOd7Sp53SxV2QZPQBiOXgUvGGye729T7L29Nk5R/6etznLfp4ANRvuD9nSSkAm67DbFBuFBy8AX8wZGXTtC++XMN9J/I/A8WlH8d98cVJ6vz2Ka/QRRayPFeCEv8YZdJRYWofmtbC5BIz1FkwShrBpADvbRDAZ5v7ua8BXac3YjUIunjC/rDjW2RHjjwtDwQ1LllL62LvhdmvaKBDfJ6swqnNEUnlGAKJmhG3haglt36n+az8OOcJEECAjMRWg5dtWIs7fJ4g==\"",
        "id": 11
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2186877585.251948,
        "hostOnly": false,
        "httpOnly": true,
        "name": "sst-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": "0",
        "value": "Sst1|PQHm-rMKKx-2jqaxJmWa7uK_C0RCbyFLwK1hOzNFwb2Z87HbY3-9niWNoKx_hQCJNU_xStu9KPmtLPMlbBd059LX9tXlJwmggunUOZVvhEj_DtFT196kGWDPp5MqANTngQtoPcirBlbyKYCMRBsSeNg9IaPca_AVjSFkK4p5mYT1Ho7YWiJJZFRT_mO6vPrt3Zc-iTGqxPAJ8ta4AIHfE8Q0ApDn7ZvWGdK6UhZ_t9wXwL6_ffMffIvc7mb_ST7ZYFPYB6sHu8WqlaJ8b3baYSc7H1p3nael_7Kb_Kct3g6zwyLuiIXCjQFf47e9ckfY6SKKcTRWRuaHpYMJKnbbvg4jYA",
        "id": 12
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787202.378975,
        "hostOnly": false,
        "httpOnly": false,
        "name": "ubid-acbus",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "132-0890182-3045412",
        "id": 13
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787201.372041,
        "hostOnly": false,
        "httpOnly": false,
        "name": "ubid-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "132-0890182-3045412",
        "id": 14
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 1870873713,
        "hostOnly": false,
        "httpOnly": false,
        "name": "unique_id",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "msh0PVqscLqxxk2TZU0e2QM2USIKzWhi",
        "id": 15
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2186877585.251827,
        "hostOnly": false,
        "httpOnly": false,
        "name": "x-main",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "\"lCzqZ9wA?WRl6sHMhI6846RMj5PR71i9xJVVY1lBydbjcuIoIftgNKMMBd7BUM7Y\"",
        "id": 16
    },
    {
        "domain": ".amazon.com",
        "expirationDate": 2082787202.184196,
        "hostOnly": false,
        "httpOnly": false,
        "name": "x-wl-uid",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "1V2H5k7nIEk/0AfUSvTjWgU3q5LJ09fkDMtiA/uHLPB0l9kv7ZJrvqvtmjsvfUiF3TD6kb94ad1U4LmoHxAhNzVHPzzrNfGuliOMEqaBEkr7ssWf/fo/KNBoRmOpLo8GZEMBvqXo4rpk=",
        "id": 17
    },
    {
        "domain": "www.amazon.com",
        "expirationDate": 2419066000,
        "hostOnly": true,
        "httpOnly": false,
        "name": "amznacsleftnav-226d22cb-99de-4f15-a55e-8d259c3574db",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "1",
        "id": 18
    },
    {
        "domain": "www.amazon.com",
        "expirationDate": 1616656718,
        "hostOnly": true,
        "httpOnly": false,
        "name": "csm-hit",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "tb:s-TSM2W1AVM47DXDXD3PZH|1556176717875&t:1556176718486&adb:adblk_no",
        "id": 19
    }
    ];
     
    try {
        for (let cookie of cookiesArr) {
            await page.setCookie(cookie)
        };
        console.log('Session has been loaded in the browser'); 
    } catch (error) {
        console.log(error);
    }
    await page.goto('https://www.amazon.com/gp/cart/view.html?ref_=nav_cart');
    const status = await page.evaluate(() => {
        return document.querySelector('div[id="sc-active-cart"]').innerText;
    });
    if (status.includes("Your Shopping Cart is empty.")){
        console.log('Check Promo Code Starting...')
        let i;
        let len = productsPromo.length;
        for (i = 0; i < len; i++) {
            //Go to Product Page
            const asin = productsPromo[i].asin;
            console.log(`Check asin: ${asin}`);
            await page.goto(`https://www.amazon.com/dp/${asin}`);
            // await page.waitFor('input[id="add-to-cart-button"]');
            await page.click('input[id="add-to-cart-button"]');
            // await page.waitFor(800);
            await page.goto('https://www.amazon.com/gp/cart/view.html?ref_=nav_cart');
            // await page.waitFor('div[class="sc-proceed-to-checkout"]');
            await page.click('div[class="sc-proceed-to-checkout"]');
            await page.waitFor('td[class="a-color-price a-size-medium a-text-right a-align-bottom aok-nowrap grand-total-price a-text-bold"]');
            const pricepromo = await page.evaluate(() => {
                return /[^$]+/g.exec(document.querySelector('td[class="a-color-price a-size-medium a-text-right a-align-bottom aok-nowrap grand-total-price a-text-bold"]').innerText)[0];
            });
            if (parseFloat(productsPromo[i].price) < parseFloat(pricepromo)) {
                await sendEmail('Code het han',asin);
            } 
            await page.goto('https://www.amazon.com/gp/cart/view.html?ref_=nav_cart');
            await page.waitFor('span[class="a-size-small sc-action-delete"]');
            await page.click('span[class="a-size-small sc-action-delete"]');
        }
        await browser.close();
        console.log('Check Promo Code Completed');
    } else {
        await browser.close();
        console.log('Clear Shopping Cart Before Checking...');
    }
}


//Listen on PORT
app.listen(3000, () => {
    console.log('Server started on port 3000....');
});