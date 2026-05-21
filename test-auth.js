const axios = require('axios');
const crypto = require('crypto');

(async () => {
  const randomEmail = `test_${Date.now()}@example.com`;
  try {
    const regRes = await axios.post('http://localhost:3000/api/auth/register', {
      email: randomEmail,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'adoptante',
      termsAccepted: true,
    });
    console.log('Registro exitoso:', regRes.data);
  } catch (err) {
    if (err.response) {
      console.error('Error registro:', err.response.status, err.response.data);
    } else {
      console.error('Error registro:', err.message);
    }
  }

  // Test forgot password
  try {
    const fpRes = await axios.post('http://localhost:3000/api/auth/forgot-password', {
      email: randomEmail,
    });
    console.log('Forgot password response:', fpRes.data);
  } catch (err) {
    if (err.response) {
      console.error('Error forgot password:', err.response.status, err.response.data);
    } else {
      console.error('Error forgot password:', err.message);
    }
  }
})();
