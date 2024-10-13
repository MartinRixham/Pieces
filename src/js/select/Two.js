define(["jquery"], function($) {

	function Two() {

		this.onBind = function(element) {

			$(element).load("html/select/two.html");
		};
	}

	return Two;
});
