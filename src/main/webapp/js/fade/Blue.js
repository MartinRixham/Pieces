define([], function() {

	function Blue(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/blue.html");
		};

		this.back = new Click(back);
	}

	return Blue;
});
