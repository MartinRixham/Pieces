define(["jquery"], function($) {

	function One() {

		this.onBind = function(element) {

			$(element).load("html/scroll/one.html");
		};
	}

	return One;
});
