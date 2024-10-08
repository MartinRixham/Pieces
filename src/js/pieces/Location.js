define([], function() {

	if (typeof location == "undefined") {

		return {

			hash: ""
		};
	}
	else {

		return location;
	}
});
