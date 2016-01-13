'use strict'

var MAX_FILE_SIZE = 1024*1000*1000*150; //150 GB
var sysMB = 1024*1024; //windows definition of a megabyte
// attach events
function Init() {
  var filefield = $id("filefield");
  // file select
  filefield.addEventListener("change", FileSelectHandler, false);
  $id('file').addEventListener("change", FileSelectHandler, false);
  // file drop
  filefield.addEventListener("dragover", FileDragHover, false);
  filefield.addEventListener("dragleave", FileDragHover, false);
  filefield.addEventListener("drop", FileSelectHandler, false);
}
if (window.File && window.FileList && window.FileReader) {
  window.onload = function() {
    if(AzureClientUploader && customutilsloaded) {
      Init();
    }
  }
} else {
  alert("Your browser isn't configured for or doesn't support file uploads.");
}
function FileDragHover(e) {
  e.stopPropagation();
  e.preventDefault();
  e.target.className += (e.type == "dragover" ? " hover" : "");
}
function FileSelectHandler(e) {
  // cancel default action and hover styling
  FileDragHover(e);
  var files = e.target.files || e.dataTransfer.files;
  if(files.length>0){
    var file = files[0];
    var fileInfo =
        "<ul class='menu vertical'>"+
          "<li>File name: <strong>" + file.name + "</strong></li>"+
          "<li>type: <strong>" + file.type +"</strong></li>"+
          "<li>size: <strong>" +
          ((file.size > MAX_FILE_SIZE) ? file.size/sysMB+" <span class=\"warning\">!!!</span>" : file.size/sysMB) +
          "</strong> MB</li>"+
        "</ul>";
    $qs('#filefield').innerHTML = fileInfo;
    var vdatael = document.createElement('video');
    vdatael.src = URL.createObjectURL(file);
    vdatael.addEventListener('loadedmetadata', function(){
      var options = {
        start: 0,
        end: vdatael.duration,
        initialStart: 0,
        //initialEnd: vdatael.duration,
        binding: true,
        doubleSided: false //TODO: set to true when bug is fixed
      };
      var sliders = [];
      $('.slider').each(function(index){ //initialize all sliders on the page
        if(index == 1) options.initialStart = vdatael.duration;
        var slider = new Foundation.Slider($(this), options);
        $(this).on('moved.zf.Slider', function(event){
          console.log($(this));
          console.log(event);
        });
        sliders.push(slider); //store for possible reference
      });
      var trimcontrols = $qs('#trim');
      trimcontrols.style.display = ''; //reveal the trim controls element after the video has been processed
    });
    ParseFile(file);
  } else {
    console.log('No files detected');
  }
}
function ParseFile(file) {
  var uploadThisShit= function (e){
    e.preventDefault();
    if(parseFloat($('#startsAt').val()) > parseFloat($('#endsAt').val())){
      console.log($('#startsAt').val());
      console.log($('#endsAt').val());
      return alert('Start time can not be after end!');
    }
    var uploadbutton = $id("submit");
    var xhr = new XMLHttpRequest();
    if (xhr.upload) {
      uploadbutton.disabled = true;
      uploadbutton.value = "One moment...";
      var uploadUrl = ((window.location.hostname=='localhost')?"http://localhost:1337":"https://"+window.location.hostname)+"/asset/getUploadUrl";
      var formData = new FormData();
      formData.append("title", $id("upload").querySelector("input[name=\"title\"]").value);
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.send(formData);
      xhr.onreadystatechange = function(e) {
        if (xhr.readyState == 4) {
          $id("submit").value = (xhr.status == 200 ? "Starting upload..." : "Error!");
          if(xhr.status == 200){
            var info = JSON.parse(xhr.response);
            var edit = {
              startsAt: $('#startsAt').val(),
              endsAt: $('#endsAt').val()
              //any further edit information, if possible, added here later
            };
			if(edit.startsAt && edit.endsAt){
				if(parseFloat(edit.startsAt)<parseFloat(edit.endsAt)){
				  if(parseFloat(edit.startsAt)!=parseFloat(edit.endsAt))
					info.edit = edit;
				} else {
				  return alert('The video can not end before start!');
				}
			}
            var uploader = new AzureClientUploader(file, info.locator, info.asset.Name);
            uploader.readBlock();
            uploader.addEventListener('progress', function(data){
              var pc = data.detail.pc;
              var offset = uploadbutton.offsetWidth - uploadbutton.offsetWidth*(pc/100);
              uploadbutton.value = pc+'% complete';
              uploadbutton.style.background = "rgb(0, 230, 118)";
              uploadbutton.style.boxShadow = "-"+offset+"0px 0px 0px rgb(56, 142, 60) inset";
            });
            uploader.addEventListener('success', function confirmUpload(evt){
              //inform server that file is registered
              var assetRegisterRequest = new XMLHttpRequest();
              var url = ((window.location.hostname=='localhost')?"http://localhost:1337":"https://"+window.location.hostname)+"/asset/register";
              assetRegisterRequest.open("POST", url);
              assetRegisterRequest.setRequestHeader("X-Requested-With", "XMLHttpRequest");
              assetRegisterRequest.setRequestHeader('Content-Type', 'application/json');
              assetRegisterRequest.send(JSON.stringify(info));
              assetRegisterRequest.onreadystatechange = function(){
                if(assetRegisterRequest.readyState == 4){
                  var response = JSON.parse(assetRegisterRequest.response);
                  if(response.assetId){
                    uploader.removeEventListener('success', confirmUpload);
                    uploadbutton.value = 'Completed!';
                    window.location = ((window.location.hostname=='localhost')?"http://localhost:1337":"https://"+window.location.hostname)+"/asset/play?assetId="+response.assetId;
                  }
                }
              }
            });
            uploader.addEventListener('error', function(data){
              uploadbutton.value = 'Error!';
              console.log(data.detail);
              alert('Error occurred while uploading your file!');
            });
          }
        }
      };
    } else {
      alert('Ajax uploading is not supported by your browser or not enabled.');
    }
  };
  $id("submit").removeEventListener('click', uploadThisShit);
  if(file.size < MAX_FILE_SIZE){
    $id("submit").addEventListener("click", uploadThisShit);
  } else {
    alert('This file is too large. Max file size is 150GB');
  }
}
