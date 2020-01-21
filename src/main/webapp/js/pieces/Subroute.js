define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route) {

		var words = [];

		var index = 0;

		var currentIndex = 0;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word) {

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					words[i].add(index, word);

					return;
				}
			}

			var newIndex = words.length;
			var newWord = new CompoundWord(currentIndex);

			words[newIndex] = newWord;
			words[newIndex].add(index, word);

			return route.addRoute(newWord);
		};

		this.update = function(index) {

			route.update(index);
		};

		this.changePage = function(index) {

			route.changePage(index);
		};

		this.callHome = function(i) {

			index = i;
		};

		this.setIndex = function(index) {

			currentIndex = index;

			for (var i = 0; i < words.length; i++) {

				words[i].setIndex(index);
			}
		};
	}

	return Subroute;
});
