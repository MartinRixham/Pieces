define(["jquery"], function($) {

	function Four() {

		this.onBind = function(element) {

			$(element).load("html/scroll/four.html");
		};
	}

	return Four;
});
