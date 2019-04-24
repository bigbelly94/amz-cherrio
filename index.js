const cheerio = require('cheerio');
const request = require('request-promise');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Product = require('./models/product');
const bodyParser = require('body-parser');
const _ = require('lodash');

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

    let description = $("#productDescription, productDescription_feature_div");
    description = !_.isEmpty(description) ? description.html.trim : "";

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
}, 1800000);

//Listen on PORT
app.listen(3000, () => {
    console.log('Server started on port 3000....');
});