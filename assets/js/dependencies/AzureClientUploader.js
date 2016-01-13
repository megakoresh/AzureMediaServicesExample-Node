/**
 * Created by HauskaNimi on 13.1.2016.
 */
'use strict'

function AzureClientUploader(file, locator, name){
  var uploader = this;
  this.file = file;
  this.fileSize = file.size;
  this.maxBlockSize = 256 * 1024; //Each file will be split in 256 KB.
  this.numberOfBlocks = 1;
  this.currentFilePointer = 0;
  this.totalBytesRemaining = 0;
  this.blockIds = [];
  this.blockIdPrefix = "block-";
  this.bytesUploaded = 0;
  this.reader = new FileReader();
  if(name) //if name is given get the extension of the file and append it to the name
    name = name+file.name.substr(-(file.name.length-file.name.lastIndexOf('.')));
  if(!name || name== 'Default title') //if name is not given, use the file name
    name = file.name.replace(/[!*'();:@&=+$,\/?%#\[\]]/g,'');
  this.uploadUri = locator.BaseUri+'/'+name+locator.ContentAccessComponent;
  this.progress = new CustomEvent('progress', {
    'detail': {
      pc: ((parseFloat(this.bytesUploaded) / parseFloat(this.fileSize)) * 100).toFixed(2)
    }
  });
  this.success = new CustomEvent('success', {
    'detail': {
      success: true
    }
  });
  this.error = new CustomEvent('error', {
    'detail': {
      error: true
    }
  });
  this._registrations = {};
  this.reader.onloadend = function (evt) {
    if (evt.target.readyState == FileReader.DONE) { // DONE == 2
      var uri = uploader.uploadUri + '&comp=block&blockid=' + uploader.blockIds[uploader.blockIds.length - 1];
      var requestData = new Uint8Array(evt.target.result);
      var putBlobRequest = new XMLHttpRequest();
      putBlobRequest.open("PUT", uri);
      putBlobRequest.setRequestHeader('x-ms-blob-type', 'BlockBlob');
      putBlobRequest.send(requestData);
      putBlobRequest.onreadystatechange = function() {
        if(this.readyState == 4 && this.status == 201) {
          console.log(putBlobRequest.response);
          console.log(putBlobRequest.status);
          uploader.bytesUploaded += requestData.length;
          uploader.progress.detail.pc = ((parseFloat(uploader.bytesUploaded) / parseFloat(uploader.fileSize)) * 100).toFixed(2);
          uploader.dispatchEvent(uploader.progress);
          uploader.readBlock();
        } else {
          console.log(putBlobRequest.response);
        }
      };
    }
  };
  console.log(this.uploadUri);
  if (this.fileSize < this.maxBlockSize) {
    this.maxBlockSize = this.fileSize;
    console.log("max block size = " + this.maxBlockSize);
  }
  this.totalBytesRemaining = this.fileSize;
  if (this.fileSize % this.maxBlockSize == 0) {
    this.numberOfBlocks = this.fileSize / this.maxBlockSize;
  } else {
    this.numberOfBlocks = parseInt(this.fileSize / this.maxBlockSize, 10) + 1;
  }
  console.log("total blocks = " + this.numberOfBlocks);
}

//Custom event system
AzureClientUploader.prototype._getListeners= function(type, useCapture) {
  var captype= (useCapture? '1' : '0')+type;
  if (!(captype in this._registrations))
    this._registrations[captype]= [];
  return this._registrations[captype];
};
AzureClientUploader.prototype.addEventListener= function(type, listener, useCapture) {
  var listeners= this._getListeners(type, useCapture);
  var ix= listeners.indexOf(listener);
  if (ix===-1)
    listeners.push(listener);
};
AzureClientUploader.prototype.removeEventListener= function(type, listener, useCapture) {
  var listeners= this._getListeners(type, useCapture);
  var ix= listeners.indexOf(listener);
  if (ix!==-1)
    listeners.splice(ix, 1);
};
AzureClientUploader.prototype.dispatchEvent= function(evt) {
  var listeners= this._getListeners(evt.type, false).slice();
  for (var i= 0; i<listeners.length; i++)
    listeners[i].call(this, evt);
  return !evt.defaultPrevented;
};

//Uploader functionality
AzureClientUploader.prototype.readBlock = function() {
  var uploader = this;
  if (uploader.totalBytesRemaining > 0) {
    console.log("current file pointer = " + uploader.currentFilePointer + " bytes read = " + uploader.maxBlockSize);
    var chunk = uploader.file.slice(uploader.currentFilePointer, uploader.currentFilePointer + uploader.maxBlockSize);
    var blockId = uploader.blockIdPrefix + pad(uploader.blockIds.length, 9);
    console.log("block id = " + blockId);
    uploader.blockIds.push(btoa(blockId));
    uploader.reader.readAsArrayBuffer(chunk);
    uploader.currentFilePointer += uploader.maxBlockSize;
    uploader.totalBytesRemaining -= uploader.maxBlockSize;
    if (uploader.totalBytesRemaining < uploader.maxBlockSize) {
      uploader.maxBlockSize = uploader.totalBytesRemaining;
    }
  } else {
    uploader.commitBlockList();
  }
};
AzureClientUploader.prototype.commitBlockList = function() {
  var uploader = this;
  var uri = uploader.uploadUri + '&comp=blocklist';
  console.log(uri);
  var requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
  for (var i = 0; i < uploader.blockIds.length; i++) {
    requestBody += '<Latest>' + uploader.blockIds[i] + '</Latest>';
  }
  requestBody += '</BlockList>';
  var commitBlockRequest = new XMLHttpRequest();
  commitBlockRequest.open("PUT",uri);
  commitBlockRequest.setRequestHeader('x-ms-blob-content-type', uploader.file.type);
  commitBlockRequest.send(requestBody);
  commitBlockRequest.onreadystatechange = function() {
    if(this.readyState == 4){
      if(this.status == 201){
        console.log('Block list committed. Status: '+this.status);
        uploader.dispatchEvent(uploader.success);
        delete uploader.success; //success can only be fired once per file
      } else {
        console.log("Error: expected status 201, got "+this.status);
        uploader.error.detail.error = this.response;
        uploader.dispatchEvent(uploader.error);
      }
    }
  }
};
