# MediaServiceVideo

To be filled. This should include
- Project background
- Tech stack
- General description of the environment (e.g. the whole azure deployment thing and such)

## Configuring azure media service account

### `local.js`
```javascript
var fs = require('fs');
module.exports = {
  azure: {
	  MediaServicesConfig: {
      client_id: 'YOUR CLIENT ID',
      client_secret: 'YOUR CLIENT PASSWORD',
      storage: 'STORAGE ACCOUNT FOR MEDIA SERVICE', //This is created automatically after you create the media service
      storageSecret: 'STORAGE ACCOUNT SECRET' //look these up in the Storage section of the portal
    },
    AllowedHostNames: ['*'], //it is not much of a risk to allow any hosts because every locators do have a validity timeout
    //Note that these presets are for Media Encoder Standard. They will not work if the encoder is changed
    EncodingPreset: fs.readFileSync('config/EncPreset.xml', 'ucs2'), //!!!IMPORTANT!!! This is overridden in the bootstrap version.
    EncoderTaskBody: fs.readFileSync('config/EncTaskBody.xml', 'utf8')
  }
}
```
The rest of the `local.js` file is configured as normally in sails. Double check that you are not exposing any of your credentials if you have a public repository for your project (e.g. a fork of this one). By default `local.js` is added to gitignore, but if you move the credentials elsewhere you must exclude that file as well.

## Documentation
To be filled once sanitization is complete.

## Licence
<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons Licence" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This project is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.

TL;DR: That license basically means you are free to use the project however you want, just include my name somewhere if you publish or sell it as a derivative work.