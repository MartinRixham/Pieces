define([], function() {

	if (typeof history == "undefined") {

		return {

			pushState: function() {}
		};
	}
	else {

		return history;
	}
});
