/**
* UserController
*
* @description :: Server-side logic for managing Users
* @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
*/
module.exports = {
	login: function(req, res) {
		//implement authentication here.
  },
	displayPanel: function(req, res){
		return res.view('panel');
	}
};
