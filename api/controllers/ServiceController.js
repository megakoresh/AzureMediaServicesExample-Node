/**
 * DataController
 *
 * @description :: Server-side logic for managing data
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  //all functions in this controller must require an active shibboleth session, if we are to do it the right way.
  //unfortunately the way this shibboleth is implemented is not very straightforward. I am not sure I can "guess"
  //the method of checking the existence of this session without actually connecting to the service
  getUserFullName: function(userId) {
    //here you get full name of user with this ID from whatever authentication/IDP you use
    return userId;
  },
  getUserCategories: function(userId) {
    var categories = ["Pets", "Animals"];
    return categories;
  },
  getCategoryInfo: function(catId) {
    return catId;
  }
};

