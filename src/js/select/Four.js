define(["jquery"], function($) {

	function Four() {

		this.onBind = function(element) {

			$(element).load("html/select/four.html");
		};
	}

	return Four;
});
