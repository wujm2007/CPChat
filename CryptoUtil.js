/**
 * Created by jameswu on 2017/5/6.
 */

const crypto = require('crypto');

function AES256Cipher(plainText, key) {
    const cipher = crypto.createCipher('aes256', key);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function AES256Decipher(encrypted, key) {
    const decipher = crypto.createDecipher('aes256', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports.AES256Cipher = AES256Cipher;
module.exports.AES256Decipher = AES256Decipher;
