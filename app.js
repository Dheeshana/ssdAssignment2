const express = require('express');
const app = express();
const fs = require('fs');

const multer = require('multer');



const {google} = require('googleapis');
const { oauth2 } = require('googleapis/build/src/apis/oauth2');
const OAuth2 = require('./credentials.json');

const CLIENT_ID = OAuth2.web.client_id;
const CLIENT_SCERET = OAuth2.web.client_secret;
const REDIRECT_URI =OAuth2.web.redirect_uris[0];

const OAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SCERET,
    REDIRECT_URI
);

var authed = false;

var name, pic;

var Storage = multer.diskStorage({
    destination: function (req, file, callback) {
      callback(null, "./images");
    },
    filename: function (req, file, callback) {
      callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
    },
  });
  
  var upload = multer({
    storage: Storage,
  }).single("file");

const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";


app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    if(!authed){

        var url = OAuth2Client.generateAuthUrl({
            access_type : 'offline',
            scope : SCOPES
        })
        console.log(url);
        res.render("index", {url:url})

    }else{
        var Oauth2 = google.oauth2({
            auth: OAuth2Client,
            version: 'v2'
        })

        //user information
        
        Oauth2.userinfo.get(function(err, response){
            if(err) throw err
            console.log(response.data)

            name = response.data.name;
            pic = response.data.picture;
            res.render('success', {name:name, pic:pic, success: false});
        })
    }
})


app.post("/upload", (req, res) => {
    upload(req, res, function (err) {
      if (err) {
        console.log(err);
        return res.end("Something went wrong");
      } else {
        console.log(req.file.path);
        const drive = google.drive({ version: "v3",auth:OAuth2Client  });
        const fileMetadata = {
          name: req.file.filename,
        };
        const media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path),
        };
        drive.files.create(
          {
            resource: fileMetadata,
            media: media,
            fields: "id",
          },
          (err, file) => {
            if (err) {
              // Handle error
              console.error(err);
            } else {
              fs.unlinkSync(req.file.path)
              res.render("success",{name:name,pic:pic,success:true})
            }
  
          }
        );
      }
    });
});

app.get('/logout',(req,res) => {
    authed = false;
    res.redirect('/')
})

app.get('/google/callback', (req, res) => {
    const code = req.query.code;
    if(code){
        //get access code
        OAuth2Client.getToken(code, function(err, token) {
            if(err){
                console.log('Error in Authentication');
                console.log(err);
            }else{
                console.log('Successfully Authenticated!!');
                console.log(token);
                OAuth2Client.setCredentials(token);
                
                authed = true;
                res.redirect('/');
            }
        })
    }
})

app.listen(5000, () => {
    console.log('App is listening on port 5000');
})