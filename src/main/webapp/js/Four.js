define(["jquery"], function($) {

	function Four() {

		this.onBind = function(element) {

			$(element).load("html/four.html");
		};
	}

	return Four;
});
