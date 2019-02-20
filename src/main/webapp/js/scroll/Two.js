define(["jquery"], function($) {

	function Two() {

		this.onBind = function(element) {

			$(element).load("html/scroll/links.html");
		};
	}

	return Two;
});
