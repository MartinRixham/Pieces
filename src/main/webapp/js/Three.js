define(["jquery"], function($) {

	function Three() {

		this.onBind = function(element) {

			$(element).load("html/three.html");
		};
	}

	return Three;
});
