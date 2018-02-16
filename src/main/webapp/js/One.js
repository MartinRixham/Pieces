define(["jquery"], function($) {

	function One() {

		this.onBind = function(element) {

			$(element).load("html/one.html");
		};
	}

	return One;
});
