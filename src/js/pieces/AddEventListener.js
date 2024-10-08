define([], function() {

	if (typeof addEventListener == "undefined") {

		return function() {};
	}
	else {

		return addEventListener;
	}
});
