define(["jquery"], function($) {

	function Three() {

		this.onBind = function(element) {

			$(element).load("html/select/three.html");
		};
	}

	return Three;
});
