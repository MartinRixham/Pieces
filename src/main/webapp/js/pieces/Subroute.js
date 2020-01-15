define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route) {

		var words = [];

		var index = 0;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word) {

			if (!words[index]) {

				words[index] = new CompoundWord();
			}

			words[index].push(word);
			route.addRoute(word);
		};

		this.update = function(index) {

			route.update(index);
		};

		this.changePage = function() {};

		this.callHome = function(i) {

			index = i;
		};

		this.setIndex = function(index) {

			for (var i = 0; i < words.length; i++) {

				words[i].setIndex(index);
			}
		};
	}

	return Subroute;
});
