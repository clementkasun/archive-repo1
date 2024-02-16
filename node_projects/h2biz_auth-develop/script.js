
const bcrypt = require('bcrypt');



bcrypt.genSalt(10, (err, salt) => {
    bcrypt.hash('admin', salt, async (err, hash) => {
        if (err) {
            console.log('bcrypt gen error: ' + err.message);
        }
        
        console.log(hash);

    });
});


