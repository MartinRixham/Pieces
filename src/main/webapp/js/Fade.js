define(["jquery", "js/Code"], function($, Code) {

	function Fade() {

		this.onBind = function(element) {

			$(element).load("html/fade.html");
		};

		this.code = new Code("Fade.js");
	}

	return Fade;
});
