module.exports = {
  byUser: function(user, list) {
    /*
    This runs through every item in the provided list and checks whether the requested user can see it.
    It will return a new list with only those items that have passed verification.
    */
    var passed = [];
    var item;
    if(typeof user === 'undefined'){ //if somehow someone hacks through to run this without a valid session, they will just get nothing
      sails.log.error('You got trolled.');
      return {error: 'You got trolled.'};
    }
    for(var i in list) {
      item = list[i];
      if(item.author != user.id && item.permission != 0) {
        if(item.permission == 1) {
          if(_.contains(user.categories, item.category)) {
            passed.push(item);
          }
        }
      } else { //if public or the person requesting is the author, then just pass
        passed.push(item);
      }
    }
    return passed;
  },
  //This next one is UNSAFE! It ignores user's eligibility to view the list.
  //It will return all entries matching the category, as long as they aren't private.
  byCategory: function(courseId, list) { //this checks which items from the list belong to a course and returns those that do.
    var passed = [];
    var item;
    if(typeof courseId === 'undefined'){
      return _.filter(list, function(item){
        return (item.category == 'Other' && item.permission == 0); //if nothing is provided, just return the public uncategorized entries
      });
    }
    for(var i in list) {
      item = list[i];
      if(item.category == courseId && item.permission !== 2) {
        passed.push(item);
      }
    }
    return passed;
  },
  byTitle: function(title, list) { //UNSAFE. Self-explanatory.
    var passed = [];
    var item;
    if(typeof title === 'undefined'){
      return list || []; //don't do anything if something's wrong with the arguments
    }
    if(typeof title !== 'string'){
      title.toString(); //A bit crude, but does the job - users should never call this funtion directly anyway.
    }
    for(var i in list) {
      item = list[i];
      if(_.includes(item.title, title)) { //Maybe some better search logic is gonna be needed later. For now this will do.
        passed.push(item);
      }
    }
    return passed;
  }
}
