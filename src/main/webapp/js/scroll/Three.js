define(["jquery"], function($) {

	function Three() {

		this.onBind = function(element) {

			$(element).load("html/scroll/three.html");
		};
	}

	return Three;
});
