/**
 * Created by HauskaNimi on 3.11.2015.
 */
$(document).foundation();
var MIN_PLAYER_WIDTH = 640;
window.onload = function(){
  if(window.location.pathname.toLowerCase() == '/asset/play'){
    if(amp){
      playerSettings.autoplay = true;
      playerSettings.controls = true;
      var mediaPlayer = amp(media.assetId, playerSettings, function(){
        var player = this;
        var playerEl = document.getElementById(media.assetId);
        player.addEventListener(amp.eventName.loadedmetadata, function(){
          var streamsList = player.currentVideoStreamList();
          if(streamsList){
            var track = streamsList.streams[0].tracks[0];
            var ratio = track.width/track.height;
            adjustSize(playerEl, ratio);
            window.addEventListener('resize', function(){adjustSize(playerEl, ratio);});
          }
        });
      });
      function adjustSize(el, ratio){
        var width = el.parentElement.clientWidth*0.97;
        if (width < MIN_PLAYER_WIDTH) width = MIN_PLAYER_WIDTH;
        el.style.width = width+'px';
        el.style.height = width/ratio+'px';
      }
      mediaPlayer.src([{
        src: playbackUrl,
        type: 'application/vnd.ms-sstr+xml'
      }]);
    } else {
      console.log('ERROR! Expected azure media player loaded, but amp was not defined.');
    }
  } else {
    console.log('Not in player view, ignoring player styling logic.');
  }
}

$("#deleteVideo").submit(function(event){
  var confirmmsg = 'Do you want to permanently delete '+media.title+'? \n It will not be available for viewing or download.';
  if(!window.confirm(confirmmsg)){
    event.preventDefault();
  } else {
    $("#deleteVideo").find("input[type=\"submit\"]").prop("disabled", true).val('Removing, please wait...');
  }
});
$("#download").click(function(event){
  var button = $(this);
  button.html('<li></li><li></li><li></li><li></li>');
  $.get('/asset/download?assetId='+media.assetId, function(data, status){
    if(status == 'success'){
      button.html('Download original video');
      var win = window.open(data, '_blank');
      if(win){
        win.focus();
      } else {
        alert('Looks like your browser blocked the download tab. Please allow popups for this site.');
      }
    } else {
      button.html('Error!');
      console.log(data);
    }
  });
});
