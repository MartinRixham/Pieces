define(["jquery"], function($) {

	function Two() {

		this.onBind = function(element) {

			$(element).load("html/scroll/two.html");
		};
	}

	return Two;
});
