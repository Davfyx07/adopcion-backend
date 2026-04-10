const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

const uploadImage = async (base64) => {
    const res = await cloudinary.uploader.upload(base64, {
        folder: 'albergues'
    });
    return res.secure_url;
};

const deleteImage = async (url) => {
    try {
        const publicId = url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`albergues/${publicId}`);
    } catch (err) {
        console.warn('No se pudo eliminar imagen anterior');
    }
};

module.exports = {
    uploadImage,
    deleteImage
};