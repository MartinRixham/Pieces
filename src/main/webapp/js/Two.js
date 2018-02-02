define(["jquery"], function($) {

	function Two() {

		this.onBind = function(element) {

			$(element).load("html/two.html");
		};
	}

	return Two;
});
