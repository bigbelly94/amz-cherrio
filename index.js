const cheerio = require('cheerio');
const request = require('request-promise');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Product = require('./models/product');
const bodyParser = require('body-parser');
const _ = require('lodash');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const expressValidator = require('express-validator');
const flash = require('connect-flash');
const session = require('express-session');

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
//Express Session Middleware
app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true,
}))
//Express Messages Middleware
app.use(flash());
app.use(function (req, res, next){
    res.locals.messages = require('express-messages')(req, res);
    next();
})
//Express Validator Middleware
app.use(expressValidator());

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
    let asin = req.body.asin.trim();
    let title = req.body.title.trim();
    let promo = req.body.promo;
    let errors = [];

    if(!asin){
        errors.push({msg:'Asin is require'});
    }
    if(!title){
        errors.push({msg:'Title is require'});
    }    

    if(errors.length > 0){
        res.render('get',{
            title: 'Get Product',
            errors: errors
        });
    } else{
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
                    product.images = details.imgs;
                    product.isPromo = promo == "on" ? true : false;
                    try {
                        await product.save();
                        req.flash('success','Get Product Successful')
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
                req.flash('warning','Product have been already added');
                res.render('edit_product',{
                    product: product
                })
            }
        })
    }
})

//Get Single Product Route
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
            req.flash('success','Product Updated.')
            res.redirect('/');
        }
    });
});

//Delete Product Route
app.delete('/product/:asin',(req, res) => {
    Product.deleteOne({asin: req.params.asin}, (err) => {
        if(err){
            console.log(err);
        }
        req.flash('success','Deleted.');
        res.redirect('/');
    });
});

//Check Price Route
app.get('/products/checkprice',(req, res) => {
    (async () => {
        await checkPrice();
    })()
})

//Check Promo Route
app.get('/products/checkpromo',(req, res) => {
    (async () => {
        await checkPromoCode();
        res.sendStatus(200);
    })()
})

//Func get Product Detail
async function getProductDetail (asin) {
    try {
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
        });
        const $ = cheerio.load(res);
        let d1 = $('script[type="text/javascript"]');
        let d2;
        let i = 0;
        let d1len = d1.length;
        for (i; i < d1len; i++) {
            if (d1[i].firstChild.data.includes(`'colorImages': { 'initial':`)) {
                d2 = d1[i].firstChild.data;
            };
        };
        let d3 = JSON.parse((/\[{"hiRes":(.+)]/gm.exec(d2))[0]);
        let imgs = [];
        d3.forEach(function(img) {
            const urlImg = img.hiRes != null ? img.hiRes : img.large;
            imgs.push(urlImg);
        });
        const status = $('#availability').text().trim();
        let price, seller;
        if (!status.includes('Available from these sellers.') && !status.includes('Currently unavailable.')) {
            price = /[^$]+/g.exec($('#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice, #priceblock_businessprice').text().trim())[0];
            seller = $('#merchant-info').text().trim();
        };
        const about = [];
        let arr = $('ul[class="a-unordered-list a-vertical a-spacing-none"] > li, ul[class="a-unordered-list a-vertical a-spacing-none collapsedFeatureBullets"] > li');
        let len = arr.length;
        for (i=1; i < len; i++) {
            about.push($.text($(arr[i])).trim());
        };
    
        let description = $('div[id="productDescription"]');
        description = !_.isEmpty(description) ? $.html($(description[0])).trim() : "";
    
        return {
            price,
            status,
            seller,
            imgs,
            asin,
            about,
            description
        }
    } catch (error) {
        console.log(error.statusCode)
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
        try {
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
        } catch (error) {
            if (error) {
                await sendEmail('SẢN PHẨM KHÔNG TỒN TẠI', products[i].price,undefined,products[i].asin);
                continue;
            }
            
            console.log(error);
        }
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
        text : `ASIN: ${asin }
        Giá cũ: ${price}
        Giá mới: ${cprice}
        Link amazon: https://www.amazon.com/dp/${asin }
        Link san pham: http://www.amaget.online/product/${asin }`
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

//Check Promo Code
async function checkPromoCode () {
    //Initial
    var productsPromo = await Product.find({ isPromo: true });
    if (!_.isEmpty(productsPromo)){
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: false
        });
        page = await browser.newPage();
    
        // khong load img, fond
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font') {
                request.abort();
            } else {
                request.continue();
            }
        });
        //Set Cookies
        let cookiesArr =  [
            {
                "domain": ".amazon.com",
                "expirationDate": 2187597358,
                "hostOnly": false,
                "httpOnly": false,
                "name": "a-ogbcbff",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "1",
                "id": 1
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187164518,
                "hostOnly": false,
                "httpOnly": true,
                "name": "at-main",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": true,
                "session": false,
                "storeId": "0",
                "value": "Atza|IwEBID9WDK6iaMYsTb6AVqdVaSU9r9ZugWjkHjLB6OQ0_GMCEeM6MAYrzVlc4u374jfcxlqix3iA8Kl7V1zjtkC64MU7TLhUGjHp0edH8bIEBvaUS5ZoMIYVnF4Z5zNTzOaOOPkid_cxDAYIPRZR3LltBVF3hoOH_ORowjON-GZz-djI5AfOtiAtfVlnELat25StTwj3Mn4xx2byKiEH9k4J022Pb3M0tjPFiNXp70gA4d2PcwStZsQFt4XB8mYGhEoPxlYJzzMI5jnnZDKOIzdO-XfOTUBGFPi3NhtyDHWNMqU2-KB0EppNEilubHfOhqSZXYLNBqbgA04Ww9f1N7WhlH64_47SxU4Eb4SZvyfrQB0_71POiK5BUH1peIcP4dv5y6K2-YwEgke3xWbxA4u4PHgO",
                "id": 2
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2186201845,
                "hostOnly": false,
                "httpOnly": false,
                "name": "aws-priv",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "eyJ2IjoxLCJldSI6MCwic3QiOjB9",
                "id": 3
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187163300,
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
                "expirationDate": 2187247995,
                "hostOnly": false,
                "httpOnly": false,
                "name": "s_dslv",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "1556182395226",
                "id": 5
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 1988182395,
                "hostOnly": false,
                "httpOnly": false,
                "name": "s_nr",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "1556182395223-Repeat",
                "id": 6
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187330077,
                "hostOnly": false,
                "httpOnly": false,
                "name": "s_pers",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "%20s_fid%3D4256407EF069B474-0414F47A1EC010B0%7C1714030877666%3B%20s_dl%3D1%7C1556179877668%3B%20gpv_page%3DUS%253AAZ%253ASOA-overview-sell%7C1556179877676%3B%20s_ev15%3D%255B%255B%2527AZUSSOA-yaflyout%2527%252C%25271556178077693%2527%255D%255D%7C1714030877693%3B",
                "id": 7
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
                "value": "1986801149381%26vn%3D2",
                "id": 8
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187164518,
                "hostOnly": false,
                "httpOnly": true,
                "name": "sess-at-main",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": true,
                "session": false,
                "storeId": "0",
                "value": "\"B5uj1ETgUyJ7uvgVweX52OoOoGRtyiSOWoxFfD6zydg=\"",
                "id": 9
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2082787200,
                "hostOnly": false,
                "httpOnly": false,
                "name": "session-id",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "139-5561679-6623453",
                "id": 10
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2186900431,
                "hostOnly": false,
                "httpOnly": false,
                "name": "session-id-eu",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "259-3854612-2148643",
                "id": 11
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2082787200,
                "hostOnly": false,
                "httpOnly": false,
                "name": "session-id-time",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "2082787201l",
                "id": 12
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2186900431,
                "hostOnly": false,
                "httpOnly": false,
                "name": "session-id-time-eu",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "2186900431l",
                "id": 13
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187164518,
                "hostOnly": false,
                "httpOnly": false,
                "name": "session-token",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "4Fcel5+B3ZNl1dzSuo1nOYdbFh9PLLtFdd9hxXGmznMdNZ8Bgvtqr/VAoRpgiztvfdT09WBgEW9P+Od/3Jpg3B82uzqNzp4DmYM53fkpj/+kcAbnO9xjnFQ08DzvPVQTX4kTE1yg2tEhaOfMRMW1QXfS+DSakNyNswYwZkhaXVQ4Asejrh2OkerScwkM7T9S5yWeoH1ozV0pIgpvhfq+Xv/xAq+2TWb9NBhG3ptlzYNS4zhlkxpzXZKYbdaoygbR6ceTWGmJoMMTz6idZjj/MLeRUkPKL86d",
                "id": 14
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2186926647,
                "hostOnly": false,
                "httpOnly": true,
                "name": "sid",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": true,
                "session": false,
                "storeId": "0",
                "value": "\"xcOeCaeRHO3ywnZHBwwTyg==|EDPcQlWwL/xjeT8/elfkYKBBf8XkgGeLu8pWoHROyhM=\"",
                "id": 15
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187164518,
                "hostOnly": false,
                "httpOnly": true,
                "name": "sst-main",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": true,
                "session": false,
                "storeId": "0",
                "value": "Sst1|PQH3aW5WUfdW4yK3JxagMzduC-qLCB3XHOjLsA9EF3xSkyeMa9CUV-JlonzPJ0sDwcMeN2GyVCXlA6I03f52NrJiSMELhZ_8QTG2NW5SQwZiIM6r8M_9TazbYM87zK9bEMpJuD6ZN3ZoSfrAn-qsJvmxEzEbE23MB4yBETT0KDkw4eTSJ6htzsmPLBXO6R7cAC361gCdKwhLJha8QDxbTtHcIxMsqCkAEb7fq1fMh0hVaqmKQBZSGlsvctLJ5kKTbY4z0lxBpzR5PwI_ZSRRsl-Fa-RulA-dUlqgWdI_6mIqLZa4w3y1ExpLTYcftvgnpgQ712wSTm4r3ISQD1tGSdgwMA",
                "id": 16
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2186900433,
                "hostOnly": false,
                "httpOnly": false,
                "name": "ubid-acbuk",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "259-6814295-7590727",
                "id": 17
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2082787202,
                "hostOnly": false,
                "httpOnly": false,
                "name": "ubid-acbus",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "132-0890182-3045412",
                "id": 18
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2082787200,
                "hostOnly": false,
                "httpOnly": false,
                "name": "ubid-main",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "132-0890182-3045412",
                "id": 19
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
                "id": 20
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187935146,
                "hostOnly": false,
                "httpOnly": false,
                "name": "UserPref",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "UJnxUhPqg7d3XX8tnqvpWwaq6uwLGjguSqBpnVK3itzt7dr44g9zsnaX7YY2WzRtPSVeI6nY6k7phLEEe/SekgoSCqhPfx9/scumsUKGFx13kOzQOdW9u3wd3rgih0UWwUYjmRaIZ+Yekqc8KJ34dwMnxJeYQOQ4aic6Nn26eABhccVto2BBbzhDoTn/2hAwzlUD8ys9Z/dwEJCpEUzschYy16+Z8J7yngSQMUA9Y5GsIiEocb3kBpe+ba8Ir+AtYDjxU1iq/RLAAJBKH2kEOb06RHHKycqx5P+pAqkQFNyV8ymF74WVoekdkHO3QykmKaj3IrV4RzzOHVXwihE4MjWQ9sCDEpe/A45LrYH1LnqOxAoYYcKwVRQhdZnbMPvlLq1rw3Y0+R2K8d8uKHo5+k3RtiD29t2UWa321rG/eXkhmOwDXd3iiAUOXVz/R/9OpexRnkWe014=",
                "id": 21
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2187164518,
                "hostOnly": false,
                "httpOnly": false,
                "name": "x-main",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "\"9@0W6I4kxbRUOdEwB5dNtuSHuCM1FamUGcRS4CV997CvG6Lo@CKrM7el4dhwBvHc\"",
                "id": 22
            },
            {
                "domain": ".amazon.com",
                "expirationDate": 2082787201,
                "hostOnly": false,
                "httpOnly": false,
                "name": "x-wl-uid",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "1rEdRnAntQD2Hkg8tR34oW1Lv051BCs4hKtzkYjNKdGfhmovJVba6V+aFKC9CyBjmxah5a20QrbHDK7wLd6HmihPdLkb7jX4WtUwYt/RACY694SLOglSuLl5FpqF94NCsNNHENN5eoHw=",
                "id": 23
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
                "id": 24
            },
            {
                "domain": "www.amazon.com",
                "expirationDate": 2184918119,
                "hostOnly": true,
                "httpOnly": false,
                "name": "csm-hit",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "tb:s-PNKWHQAC4MV3HPE9XSMH|1556444519177&t:1556444519216&adb:adblk_no",
                "id": 25
            },
            {
                "domain": "www.amazon.com",
                "expirationDate": 2188651277,
                "hostOnly": true,
                "httpOnly": false,
                "name": "ld",
                "path": "/",
                "sameSite": "no_restriction",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "AZUSSOA-yaflyout",
                "id": 26
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
                try {
                    await page.click('input[id="add-to-cart-button"]');
                    await page.waitFor(1000);
                    await page.goto('https://www.amazon.com/gp/cart/view.html?ref_=nav_cart');
                    await page.click('div[class="sc-proceed-to-checkout"]');
                    await page.waitFor('span[class="a-button a-button-primary continue-button continue-button-desktop"]') ;
                    await page.click('span[class="a-button a-button-primary continue-button continue-button-desktop"]') ;
                    await page.waitFor('a[class="a-declarative a-button-text "]');
                    await page.click('a[class="a-declarative a-button-text "]');
                    await page.waitFor(2000);
                    if(await page.$('span[class="a-text-strike"]') == null){
                        await sendEmail('Code het han',productsPromo[i].price,undefined,asin);
                    } 
                    await page.goto('https://www.amazon.com/gp/cart/view.html?ref_=nav_cart');
                    await page.waitFor('span[class="a-size-small sc-action-delete"]');
                    await page.click('span[class="a-size-small sc-action-delete"]');
                } catch (e) {
                    console.log(e);
                }
            }
            await browser.close();
            return console.log('Check Promo Code Completed');
        } else {
            await browser.close();
            return console.log('Clear Shopping Cart Before Checking...');
        }
    } else {
        return console.log('Dont have any product come with promo code.');
    }
}

//Set Time Check Price
var timer = setInterval(async function() {
    return await checkPrice();
}, 3600000);

//Set Time Check Price
var timer = setInterval(async function() {
    return await checkPromoCode();
}, 7200000);

//Listen on PORT
app.listen(3000, () => {
    console.log('Server started on port 3000....');
});