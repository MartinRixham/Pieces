define(["jquery"], function($) {

	function One() {

		this.onBind = function(element) {

			$(element).load("html/select/one.html");
		};
	}

	return One;
});
