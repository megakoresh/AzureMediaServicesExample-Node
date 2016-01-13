/**
 * Created by HauskaNimi on 27.10.2015.
 */
/**
 * Asset.js
 *
 * @description :: This is what we store at our Media server database
 * @docs        :: http://sailsjs.org/#!documentation/models
 */

module.exports = {
  attributes: {
    "assetId" : { //Media Services ID used to locate the asset on the service
      type: "string",
      required: true
    },
    "registered": { //assets are registered after confirming upload with client and successfully creating an encoding job
      type: "boolean",
      defaultsTo: false
    },
    "manifest": { //this is the assetId of the asset containing encoding job output
      type: "string",
      defaultsTo: null
    },
    "thumbnail": { //this contains the latest SAS url for the video's thumbnails
      type: "string",
      defaultsTo: "images/nothumbnail.jpg"
    },
    "category": { //i.e. courses in our case
      type: "string",
      defaultsTo: "Other"
    },
    "author": { //some id of the person who uploaded the content. This is NOT an association to enable third-party IDP
      type: "string",
      required: true,
      defaultsTo: "GodOfMedia" //praise be
    },
    "permission": { //permission code (e.g. 0 - public, 1 - restricted, access to category required, 2 - private, must be author to view)
      type: "integer",
      enum: [0,1,2],
      required: true,
      defaultsTo: 2
    },
    "title": { //this is what end users see, this is not the same as Azure asset name
      required: true,
      type: "string"
    },
    "description": { //self-explanatory
      type: "string",
      defaultsTo: "No description"
    },
    "metadata": { //This is mainly for debugging purposes but can be extended to contain all sorts of crap.
      type: "json",
      defaultsTo: { //encodingStatus is a required poperty for this record. It will also contain the encoding job in it's last seen state.
        encodingStatus: 'Not initialized'
      }
    }
    //TODO: Extension possible. Comments? File attachments? Editing rights?
    /*
    * comments: {
    *   collection: 'Comment',
    *   via: 'asset'
    * }
    * then in Comment model attributes
    * asset: {
    *   model: 'Asset'
    * }
    * ez
    * */
  }
};
