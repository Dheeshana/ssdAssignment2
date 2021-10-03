const express = require('express');
const app = express();
const fs = require('fs');
const multer = require('multer');
const {google} = require('googleapis');
const passport = require('passport')
const facebookStrategy = require('passport-facebook').Strategy
const session = require('express-session')
const User = require('./models/User')

//const { oauth2 } = require('googleapis/build/src/apis/oauth2');
const OAuth2 = require('./credentials.json');
const CLIENT_ID = OAuth2.web.client_id;
const CLIENT_SCERET = OAuth2.web.client_secret;
const REDIRECT_URI =OAuth2.web.redirect_uris[0];

//object to pass client ID, ClieNt secret and redirect URI
const OAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SCERET,
    REDIRECT_URI
);



//value = false, because currently we will assum that the user is not authenticated
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

//what kind information we need to access from google API
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

app.set('view engine', 'ejs');
app.use(session({ secret: 'secret key' }));
app.use(passport.initialize());
    app.use(passport.session()); 

    passport.use(new facebookStrategy({

      // pull in our app id and secret from our auth.js file
      clientID        : "239988848084194",
      clientSecret    : "033cfc3ef06dfd1b96115d787383a3ac",
      callbackURL     : "http://localhost:5000/facebook/callback",
      profileFields: ['id', 'displayName', 'name', 'gender', 'picture.type(large)','email']
  
  },// api returns
  function(token, refreshToken, profile, done) {
  
      // asynchronous
      process.nextTick(function() {
  
          // check whether if the user exist or not
          User.findOne({ 'uid' : profile.id }, function(err, user) {
  
              //if user not found display error message
              if (err)
                  return done(err);
  
              // if user is found, then log them in
              if (user) {
                  console.log("user found")
                  console.log(user)
                  return done(null, user);
              } else {
                  // if there is no user found with that facebook id, create them
                  var newUser            = new User();
  
                  // set all of the facebook information in our user model
                  newUser.uid    = profile.id; // set the users facebook id                   
                  newUser.token = token; // we will save the token that facebook provides to the user                    
                  newUser.name  = profile.name.givenName + ' ' + profile.name.familyName; // look at the passport user profile to see how names are returned
                  newUser.email = profile.emails[0].value; // facebook can return multiple emails so we'll take the first
                  newUser.gender = profile.gender
                  newUser.pic = profile.photos[0].value
                  // save our user to the database
                  newUser.save(function(err) {
                      if (err)
                          throw err;
  
                      // if successful, return the new user
                      return done(null, newUser);
                  });
              }
  
          });
  
      })
  
  }));
  
  passport.serializeUser(function(user, done) {
      done(null, user.id);
  });
  
  // deserialize the user
  passport.deserializeUser(function(id, done) {
      User.findById(id, function(err, user) {
          done(err, user);
      });
  });
      

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

app.get('/', (req, res) => {
    //if the user is not authenticated, then this block of code will execute
    if(!authed){
        //In here generate the oauth URL and redirect to there
        var url = OAuth2Client.generateAuthUrl({
            access_type : 'offline',
            scope : SCOPES
        })
        console.log(url);
        res.render("index", {url:url})

    }
    //execute the code when the user is authenticated
    else {
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

//check user logged in or not
app.get('/profile', isLoggedIn, function(req, res) {
  console.log(req.user)
  res.render('profile', {
      user : req.user
  });
});

app.get('/userinfo', (req, res) => {
  if(!authed){

    var url = OAuth2Client.generateAuthUrl({
        access_type : 'offline',
        scope : SCOPES
    })
    console.log(url);
    res.render("userinfo", {url:url})

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
        res.render('userinfo', {name:name, pic:pic, success: false});
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

//facebook logout
app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

//google account logout
app.get('/google/logout',(req,res) => {
  authed = false
  res.redirect('/')
})

function isLoggedIn(req, res, next) {

	// if user is authenticated
	if (req.isAuthenticated())
		return next();

	// return to homepage
	res.redirect('/');
}


//when click button excute the get request
//pass email
app.get('/auth/facebook', passport.authenticate('facebook', { scope : 'email' }));
app.get('/facebook/callback',
		passport.authenticate('facebook', {
			successRedirect : '/profile',
			failureRedirect : '/'
		}));

app.get('/google/callback', (req, res) => {
    //store the autherization code inside the code variable
    const code = req.query.code;

    //if any sort of code available in there (code) then get the access token
    if(code){
        //get the autharization code and access token
        OAuth2Client.getToken(code, function(err, token) {
            if(err){
                console.log('Error in Authentication');
                console.log(err);
            }else{
                console.log('Successfully Authenticated!!');
                console.log(token);
                OAuth2Client.setCredentials(token);
                
                authed = true;

                //redirect user back to the home page
                res.redirect('/');
            }
        })
    }
})

app.listen(5000, () => {
    console.log('App is listening on port 5000');
})