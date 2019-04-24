
const mongoose = require('mongoose');

const productSchema = mongoose.Schema({
  asin: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  price: Number,
  seller: String,
  image: String,
  date: {
    type: Date,
    default: Date.now
  }
});

let Product = module.exports = mongoose.model('Product',productSchema);


