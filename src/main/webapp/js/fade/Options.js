define(["jquery"], function($) {

	function Options(showPage) {

		this.onBind = function(element) {

			$(element).load("html/fade/options.html");
		};

		this.routing = new Click(function() {

			showPage(1);
		});

		this.modular = new Click(function() {

			showPage(2);
		});

		this.animation = new Click(function() {

			showPage(3);
		});
	}

	return Options;
});
