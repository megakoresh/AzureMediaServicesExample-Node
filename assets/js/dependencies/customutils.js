/**
 * Created by HauskaNimi on 13.1.2016.
 */
'use strict'

function pad(number, length) {
  var str = '' + number;
  while (str.length < length) {
    str = '0' + str;
  }
  return str;
}
// selection shorthand
function $id(id) {
  return document.getElementById(id);
}
function $qs(query) {
  return document.querySelector(query);
}
function $qsa(query) {
  return document.querySelectorAll(query);
}

window.customutilsloaded = true;
